/**
 * electron-builder afterPack hook.
 *
 * 1) Always restore sidecar `deps/` → `node_modules/` inside the packed app.
 *    Staging renames to `deps/` so createFilter does not drop the tree (exact
 *    relative path `node_modules` is skipped). Packaged Node ESM cannot resolve
 *    bare imports via NODE_PATH — only classic `node_modules` parent walks work.
 * 2) Optional ad-hoc mac codesign when OPPTRIX_MAC_UNSIGNED=1.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { RUNTIME_DEPS_DIR } = require('../electron/runtime-deps.cjs')

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, acc)
    else acc.push(full)
  }
  return acc
}

function runtimeStageRoots(context) {
  const platform = context.electronPlatformName
  if (platform === 'darwin') {
    const appName = context.packager.appInfo.productFilename
    return [path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources', 'runtime-stage')]
  }
  return [path.join(context.appOutDir, 'resources', 'runtime-stage')]
}

/** Rename staged deps → node_modules so ESM bare imports resolve in production. */
function restoreSidecarNodeModules(context) {
  for (const stage of runtimeStageRoots(context)) {
    if (!fs.existsSync(stage)) {
      console.warn(`afterPack: runtime-stage missing at ${stage}`)
      continue
    }
    const deps = path.join(stage, RUNTIME_DEPS_DIR)
    const nm = path.join(stage, 'node_modules')
    if (fs.existsSync(nm) && !fs.existsSync(deps)) {
      console.log(`afterPack: sidecar node_modules already present (${nm})`)
      continue
    }
    if (!fs.existsSync(deps)) {
      throw new Error(
        `afterPack: missing sidecar deps at ${deps} — stage-runtime must ship ${RUNTIME_DEPS_DIR}/`,
      )
    }
    if (fs.existsSync(nm)) {
      fs.rmSync(nm, { recursive: true, force: true })
    }
    fs.renameSync(deps, nm)
    console.log(`afterPack: restored sidecar deps → node_modules (${nm})`)
  }
}

function adhocSignMac(context) {
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

exports.default = async function afterPack(context) {
  restoreSidecarNodeModules(context)
  adhocSignMac(context)
}
