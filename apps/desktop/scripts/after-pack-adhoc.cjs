/**
 * Ad-hoc codesign for unsigned mac builds (before dmg/zip).
 * Required because -c.mac.identity=- does not work on CI keychain.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, acc)
    else acc.push(full)
  }
  return acc
}

exports.default = async function afterPack(context) {
  if (process.env.OPPTRIX_MAC_UNSIGNED !== '1') return
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  if (!fs.existsSync(appPath)) {
    throw new Error(`afterPack adhoc sign: missing ${appPath}`)
  }

  console.log(`Ad-hoc signing ${appPath}…`)

  const runtimeStage = path.join(appPath, 'Contents/Resources/runtime-stage')
  for (const file of walkFiles(runtimeStage)) {
    const base = path.basename(file)
    if (
      file.endsWith('.node')
      || file.endsWith('.dylib')
      || file.endsWith('.so')
      || base === 'ffmpeg'
    ) {
      execFileSync('codesign', ['--force', '--sign', '-', file], { stdio: 'inherit' })
    }
  }

  // Also sign native bindings unpacked beside the Electron app (node-llama-cpp).
  const unpacked = path.join(appPath, 'Contents/Resources/app.asar.unpacked')
  for (const file of walkFiles(unpacked)) {
    if (file.endsWith('.node') || file.endsWith('.dylib') || file.endsWith('.so')) {
      execFileSync('codesign', ['--force', '--sign', '-', file], { stdio: 'inherit' })
    }
  }

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log('Ad-hoc sign OK')
}
