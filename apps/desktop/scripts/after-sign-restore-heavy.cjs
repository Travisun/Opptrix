/**
 * electron-builder afterSign hook.
 *
 * Restores heavy Resources trees that afterPack stashed so @electron/osx-sign's
 * walkAsync + isBinaryFile does not EMFILE on python / node_modules / playwright.
 * Then re-seals the outer .app (nested trees already Developer-ID signed).
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const STASH_DIRNAME = '.opptrix-sign-stash'
const MANIFEST = 'manifest.json'

function resolveMacSigningIdentity() {
  const fromEnv = String(process.env.CSC_NAME ?? '').trim()
  if (fromEnv) return fromEnv
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const developerId = out.match(/"(Developer ID Application:[^"]+)"/)
    if (developerId) return developerId[1]
  } catch {
    /* ignore */
  }
  return null
}

/**
 * @param {{ electronPlatformName: string; appOutDir: string; packager: { appInfo: { productFilename: string } } }} context
 */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.OPPTRIX_MAC_UNSIGNED === '1') return

  const stashRoot = path.join(context.appOutDir, STASH_DIRNAME)
  const manifestPath = path.join(stashRoot, MANIFEST)
  if (!fs.existsSync(manifestPath)) {
    console.log('afterSign: no heavy-tree stash manifest — skip restore')
    return
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const resources = path.join(appPath, 'Contents', 'Resources')

  for (const item of manifest.items ?? []) {
    const from = path.join(stashRoot, item.stashName)
    const to = path.join(resources, item.rel)
    if (!fs.existsSync(from)) {
      throw new Error(`afterSign: missing stashed tree ${from}`)
    }
    fs.mkdirSync(path.dirname(to), { recursive: true })
    if (fs.existsSync(to)) {
      fs.rmSync(to, { recursive: true, force: true })
    }
    fs.renameSync(from, to)
    console.log(`afterSign: restored ${item.rel}`)
  }

  const identity = resolveMacSigningIdentity() || manifest.identity
  if (!identity) {
    throw new Error('afterSign: cannot resolve signing identity to re-seal .app')
  }

  const entitlements = path.join(__dirname, '..', 'resources', 'entitlements.mac.plist')
  const args = [
    '--force',
    '--options',
    'runtime',
    '--timestamp',
    '--sign',
    identity,
    appPath,
  ]
  if (fs.existsSync(entitlements)) {
    args.splice(args.length - 1, 0, '--entitlements', entitlements)
  }

  // No --deep: nested trees were pre-signed; deep would re-walk and risk EMFILE / broken seals.
  console.log(`afterSign: re-sealing outer app with ${identity}`)
  execFileSync('codesign', args, { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--strict', appPath], { stdio: 'inherit' })

  fs.rmSync(stashRoot, { recursive: true, force: true })
  console.log('afterSign: heavy-tree restore OK')
}

exports.STASH_DIRNAME = STASH_DIRNAME
exports.MANIFEST = MANIFEST
