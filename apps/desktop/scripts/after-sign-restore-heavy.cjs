/**
 * electron-builder afterSign hook.
 *
 * Order (electron-builder 26 notarizes *before* afterSign by default — that
 * races our restore/re-seal). We set `build.mac.notarize: false` and notarize
 * here on the *final* .app instead:
 *
 *   sign → afterSign(restore + re-seal) → notarize + staple → Gatekeeper gate → dmg/zip
 *
 * Restores heavy Resources trees that afterPack stashed so @electron/osx-sign's
 * walkAsync + isBinaryFile does not EMFILE on python / node_modules / playwright.
 * Then re-seals the outer .app (nested trees already Developer-ID signed).
 * Finally notarizes + staples when Apple credentials are present, then hard-fails
 * unless mustVerify seals still hold and spctl reports Notarized Developer ID.
 */
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
  loadMacSignChecklist,
  assertMustVerifySigned,
} = require('./lib/mac-sign-checklist.cjs')

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
 * Mirror electron-builder MacTargetHelper.getNotarizeOptions (APPLE_* / API key / keychain).
 * @param {string} appPath
 * @returns {Record<string, string> | null}
 */
function resolveNotarizeAuth(appPath) {
  const teamId = process.env.APPLE_TEAM_ID
  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  if (appleId || appleIdPassword) {
    if (!appleId) throw new Error('afterSign: APPLE_ID env var needs to be set')
    if (!appleIdPassword) {
      throw new Error('afterSign: APPLE_APP_SPECIFIC_PASSWORD env var needs to be set')
    }
    if (!teamId) throw new Error('afterSign: APPLE_TEAM_ID env var needs to be set')
    return { appPath, appleId, appleIdPassword, teamId }
  }

  const appleApiKey = process.env.APPLE_API_KEY
  const appleApiKeyId = process.env.APPLE_API_KEY_ID
  const appleApiIssuer = process.env.APPLE_API_ISSUER
  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      throw new Error(
        'afterSign: Env vars APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set',
      )
    }
    return { appPath, appleApiKey, appleApiKeyId, appleApiIssuer }
  }

  const keychain = process.env.APPLE_KEYCHAIN
  const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE
  if (keychainProfile) {
    /** @type {Record<string, string>} */
    const args = { appPath, keychainProfile }
    if (keychain) args.keychain = keychain
    return args
  }

  return null
}

/**
 * Hard Gatekeeper gate: spctl must accept as Notarized Developer ID.
 * Also runs codesign --deep --strict as supplemental diagnostics before throw.
 * @param {string} appPath
 */
function assertSpctlNotarizedDeveloperId(appPath) {
  const assessed = spawnSync('spctl', ['--assess', '-vv', '--type', 'execute', appPath], {
    encoding: 'utf8',
  })
  const dump = `${assessed.stdout || ''}${assessed.stderr || ''}`
  const accepted = /\baccepted\b/i.test(dump)
  const notarizedDevId =
    /Notarized Developer ID/i.test(dump) || /source=Notarized Developer ID/i.test(dump)
  if (accepted && notarizedDevId) {
    console.log('afterSign: spctl Gatekeeper OK (Notarized Developer ID)')
    return
  }

  // Supplemental seal check for CI diagnostics (network-less spctl may still fail).
  const deep = spawnSync('codesign', ['-vv', '--deep', '--strict', appPath], {
    encoding: 'utf8',
  })
  const deepDump = `${deep.stdout || ''}${deep.stderr || ''}`.trim()
  throw new Error(
    `afterSign: spctl Gatekeeper failed for ${appPath} `
      + `(expected accepted + Notarized Developer ID).\n`
      + `spctl status=${assessed.status}\n${dump.trim() || '(empty spctl output)'}\n`
      + `codesign --deep --strict status=${deep.status}\n${deepDump || '(empty)'}`,
  )
}

/**
 * Re-check mustVerify seals after restore+reseal+notarize (catch restore breaking seals).
 * @param {string} appPath
 */
function assertPostNotarizeMustVerify(appPath) {
  const resources = path.join(appPath, 'Contents', 'Resources')
  const checklist = loadMacSignChecklist()
  // Lazy require avoids circular load with after-pack (which lazy-requires this module).
  const { assertDeveloperIdSigned } = require('./after-pack-adhoc.cjs')
  const { checked } = assertMustVerifySigned(resources, checklist, assertDeveloperIdSigned)
  console.log(`afterSign: post-notarize mustVerify OK (checked=${checked})`)
}

/**
 * Notarize + staple the final .app. `@electron/notarize` already staples on success;
 * we still verify with `xcrun stapler validate` and throw on failure.
 * Then hard-gate mustVerify + spctl Notarized Developer ID.
 * @param {string} appPath
 */
async function notarizeAndStapleFinalApp(appPath) {
  if (process.env.OPPTRIX_MAC_UNSIGNED === '1') {
    console.log('afterSign: skip notarize (OPPTRIX_MAC_UNSIGNED=1)')
    return
  }

  const auth = resolveNotarizeAuth(appPath)
  if (!auth) {
    console.log(
      'afterSign: skip notarize (no Apple credentials — set APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_API_*, or APPLE_KEYCHAIN_PROFILE)',
    )
    return
  }

  if (!fs.existsSync(appPath)) {
    throw new Error(`afterSign: cannot notarize — missing ${appPath}`)
  }

  const { notarize } = require('@electron/notarize')
  console.log(`afterSign: notarizing final app ${appPath}`)
  await notarize(auth)
  // notarize() staples internally; validate so we never ship Unnotarized Developer ID.
  execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' })
  console.log('afterSign: notarize + staple OK')

  // Formal path with Apple credentials: seal + Gatekeeper hard gates.
  assertPostNotarizeMustVerify(appPath)
  assertSpctlNotarizedDeveloperId(appPath)
}

/**
 * @param {{ electronPlatformName: string; appOutDir: string; packager: { appInfo: { productFilename: string } } }} context
 */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  if (process.env.OPPTRIX_MAC_UNSIGNED === '1') {
    console.log('afterSign: skip restore/re-seal/notarize (OPPTRIX_MAC_UNSIGNED=1)')
    return
  }

  const stashRoot = path.join(context.appOutDir, STASH_DIRNAME)
  const manifestPath = path.join(stashRoot, MANIFEST)
  if (!fs.existsSync(manifestPath)) {
    console.log('afterSign: no heavy-tree stash manifest — skip restore')
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
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

  // Must run after restore+reseal so the ticket matches the shipped binary.
  await notarizeAndStapleFinalApp(appPath)
}

exports.STASH_DIRNAME = STASH_DIRNAME
exports.MANIFEST = MANIFEST
exports.assertSpctlNotarizedDeveloperId = assertSpctlNotarizedDeveloperId
exports.assertPostNotarizeMustVerify = assertPostNotarizeMustVerify
