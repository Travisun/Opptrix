/**
 * electron-builder afterPack hook.
 *
 * 0) On macOS: restore full `build/icons/icon.icns` over bundle stub, then strip
 *    `CFBundleIconName` so Notification Center falls back to `CFBundleIconFile`
 *    (Icon Composer Assets.car otherwise wins over the restored icns).
 * 1) Always restore sidecar `deps/` → `node_modules/` inside the packed app.
 *    Staging renames to `deps/` so createFilter does not drop the tree (exact
 *    relative path `node_modules` is skipped). Packaged Node ESM cannot resolve
 *    bare imports via NODE_PATH — only classic `node_modules` parent walks work.
 * 2) OpptrixSchedule helper generation retired (in-process schedule only).
 * 3) On signed mac builds: serially pre-sign Mach-O under `python/` and
 *    `runtime-stage/node_modules/` so electron-osx-sign can skip those trees
 *    via `build.mac.signIgnore` (avoids EMFILE from concurrent deep scans).
 * 4) Optional ad-hoc mac codesign when OPPTRIX_MAC_UNSIGNED=1.
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

/**
 * OS schedule Helper (OpptrixSchedule) is retired — in-process timer only.
 * Kept as no-op so afterPack callers stay stable.
 * @param {{ electronPlatformName: string; appOutDir: string; packager: { appInfo: { productFilename: string } } }} _context
 */
function ensurePackagedScheduleHelper(_context) {
  // no-op: do not generate OpptrixSchedule helper for OS tick cold-start
}

/**
 * Icon Composer (`build.mac.icon` = `.icon`) ships Assets.car + stub icns and sets
 * both CFBundleIconFile and CFBundleIconName. macOS Notification Center prefers
 * the Asset Catalog (CFBundleIconName → Assets.car) over icon.icns — so restoring
 * icns alone leaves NC on the Composer/stub art. Strip IconName after restore so
 * readers fall back to CFBundleIconFile → Resources/icon.icns (prepare-icons).
 */
function restoreMacBundleIcns(context) {
  if (context.electronPlatformName !== 'darwin') return

  const productFilename = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${productFilename}.app`)
  const src = path.join(__dirname, '..', 'build/icons/icon.icns')
  const dest = path.join(appPath, 'Contents', 'Resources', 'icon.icns')

  if (!fs.existsSync(src)) {
    throw new Error(`afterPack: missing full mac icon at ${src}`)
  }
  if (!fs.existsSync(appPath)) {
    throw new Error(`afterPack: missing app bundle at ${appPath}`)
  }
  const destDir = path.dirname(dest)
  if (!fs.existsSync(destDir)) {
    throw new Error(`afterPack: missing Resources dir at ${destDir}`)
  }

  fs.copyFileSync(src, dest)
  console.log(`afterPack: restored full mac icon.icns → ${dest}`)
  stripMacBundleIconName(appPath)
}

/** Remove CFBundleIconName so NC uses restored icon.icns (keeps Assets.car on disk). */
function stripMacBundleIconName(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist')
  if (!fs.existsSync(plist)) {
    throw new Error(`afterPack: missing Info.plist at ${plist}`)
  }

  let hasIconName = false
  try {
    execFileSync('plutil', ['-extract', 'CFBundleIconName', 'raw', '-o', '-', plist], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    hasIconName = true
  } catch {
    // Key absent — nothing to strip.
  }

  if (!hasIconName) {
    console.log('afterPack: CFBundleIconName already absent')
    return
  }

  execFileSync('plutil', ['-remove', 'CFBundleIconName', plist], { stdio: 'inherit' })
  console.log(`afterPack: stripped CFBundleIconName from ${plist}`)
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

function isMachOCandidate(filePath) {
  const base = path.basename(filePath)
  if (
    filePath.endsWith('.node')
    || filePath.endsWith('.dylib')
    || filePath.endsWith('.so')
    || base === 'ffmpeg'
    || base === 'ffmpeg-mac'
    || base === 'python'
    || base === 'chrome-headless-shell'
    || base === 'chrome'
    || base === 'Chromium'
    || base === 'chrome_crashpad_handler'
    || /^python3(\.\d+)?$/.test(base)
  ) {
    return true
  }
  return looksLikeMachO(filePath)
}

/** @param {string} filePath */
function looksLikeMachO(filePath) {
  try {
    const st = fs.statSync(filePath)
    if (!st.isFile() || st.size < 4) return false
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(4)
      if (fs.readSync(fd, buf, 0, 4, 0) !== 4) return false
      const be = buf.readUInt32BE(0)
      const le = buf.readUInt32LE(0)
      // MH_* and FAT_* magics (both endians)
      const magics = new Set([
        0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca,
      ])
      return magics.has(be) || magics.has(le)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return false
  }
}

/**
 * Resolve Developer ID / Apple identity for pre-sign.
 * Prefer CSC_NAME (set by electron-builder / CI); fall back to find-identity.
 * @returns {string | null}
 */
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
    const appleDev = out.match(/"(Apple Development:[^"]+)"/)
    if (appleDev) return appleDev[1]
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Serially pre-sign heavy Mach-O trees that build.mac.signIgnore will skip.
 * Must run after restoreSidecarNodeModules (deps → node_modules).
 * @param {{ electronPlatformName: string; appOutDir: string; packager: { appInfo: { productFilename: string } } }} context
 */
function preSignHeavyMacTrees(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.OPPTRIX_MAC_UNSIGNED === '1') return
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false' && !process.env.CSC_NAME) {
    console.log('afterPack: skip heavy-tree pre-sign (no identity discovery)')
    return
  }

  const identity = resolveMacSigningIdentity()
  if (!identity) {
    console.log('afterPack: skip heavy-tree pre-sign (no signing identity)')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const resources = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources')
  const roots = [
    path.join(resources, 'python'),
    path.join(resources, 'runtime-stage', 'node_modules'),
    // Must pre-sign: signIgnore skips electron-osx-sign, but notarytool still scans these.
    path.join(resources, 'runtime-stage', 'playwright-browsers'),
  ].filter((dir) => fs.existsSync(dir))

  if (roots.length === 0) {
    console.log('afterPack: no heavy trees to pre-sign')
    return
  }

  let signed = 0
  let skipped = 0
  console.log(`afterPack: pre-signing heavy Mach-O trees with identity: ${identity}`)

  for (const root of roots) {
    const files = walkFiles(root).filter(isMachOCandidate)
    console.log(`afterPack: pre-sign ${files.length} binaries under ${path.relative(resources, root) || root}`)
    for (const file of files) {
      try {
        // Serial: one codesign at a time — avoids EMFILE from electron-osx-sign fan-out.
        execFileSync(
          'codesign',
          ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, file],
          { stdio: ['ignore', 'ignore', 'pipe'] },
        )
        signed += 1
      } catch (err) {
        skipped += 1
        const message = err instanceof Error ? err.message : String(err)
        // Non-Mach-O false positives (e.g. script named python) — warn and continue.
        console.warn(`afterPack: pre-sign skipped ${file}: ${message.split('\n')[0]}`)
      }
    }
  }

  console.log(`afterPack: heavy-tree pre-sign done (signed=${signed}, skipped=${skipped})`)
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
  restoreMacBundleIcns(context)
  restoreSidecarNodeModules(context)
  ensurePackagedScheduleHelper(context)
  preSignHeavyMacTrees(context)
  adhocSignMac(context)
}

// Exported for lightweight plist-strip smoke tests (not used by electron-builder).
exports.stripMacBundleIconName = stripMacBundleIconName
exports.ensurePackagedScheduleHelper = ensurePackagedScheduleHelper
exports.preSignHeavyMacTrees = preSignHeavyMacTrees
exports.isMachOCandidate = isMachOCandidate
