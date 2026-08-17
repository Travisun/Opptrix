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
 * 3) On signed mac builds: serially pre-sign Mach-O trees listed in
 *    `resources/mac-sign-checklist.json` (python / node_modules / playwright),
 *    then stash those trees so osx-sign does not EMFILE (`build.mac.signIgnore`
 *    alone is not enough — walkAsync still opens every file). afterSign
 *    restores + re-seals, then notarizes+staples the final .app
 *    (`build.mac.notarize: false` so builder does not notarize before restore).
 *    Pipeline: afterPack(pre-sign+stash) → sign → afterSign(restore+reseal+notarize) → dmg
 *    **When bumping Playwright / Chromium (CFT), native .node/.dylib, or python
 *    layout — update `mac-sign-checklist.json` (mustVerify + signTrees).**
 * 4) Optional ad-hoc mac codesign when OPPTRIX_MAC_UNSIGNED=1.
 */
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { RUNTIME_DEPS_DIR } = require('../electron/runtime-deps.cjs')
const {
  loadMacSignChecklist,
  assertMustVerifySigned,
} = require('./lib/mac-sign-checklist.cjs')

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
 * Collect nested .app / .framework bundle paths under dir (not the outer Opptrix.app).
 * @param {string} dir
 * @returns {{ apps: string[], frameworks: string[] }}
 */
function collectNestedBundles(dir) {
  /** @type {string[]} */
  const apps = []
  /** @type {string[]} */
  const frameworks = []
  function walk(current) {
    if (!fs.existsSync(current)) return
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(current, entry.name)
      if (entry.name.endsWith('.app')) {
        apps.push(full)
        // Still walk: Chrome.app contains helper .apps and frameworks.
        walk(full)
        continue
      }
      if (entry.name.endsWith('.framework')) {
        frameworks.push(full)
        walk(full)
        continue
      }
      walk(full)
    }
  }
  walk(dir)
  return { apps, frameworks }
}

/**
 * @param {string} target
 * @param {string} identity
 * @param {{ deep?: boolean }} [opts]
 */
function codesignTarget(target, identity, opts = {}) {
  const args = ['--force', '--options', 'runtime', '--timestamp', '--sign', identity]
  if (opts.deep) args.push('--deep')
  args.push(target)
  execFileSync('codesign', args, { stdio: ['ignore', 'ignore', 'pipe'] })
}

/**
 * Notary rejects Google's nested Chrome Libraries (libEGL etc.) unless each leaf
 * Mach-O is re-signed with our Developer ID + secure timestamp. `--deep` alone
 * often leaves framework Libraries/* with the original Google seal.
 *
 * @param {string} filePath
 */
function assertDeveloperIdSigned(filePath) {
  const verify = spawnSync('codesign', ['--verify', '--strict', filePath], {
    encoding: 'utf8',
  })
  if (verify.status !== 0) {
    const detail = `${verify.stderr || verify.stdout || ''}`.trim().split('\n')[0]
    throw new Error(
      `codesign --verify failed for ${filePath}${detail ? `: ${detail}` : ''}`,
    )
  }
  const probed = spawnSync('codesign', ['-dv', '--verbose=2', filePath], {
    encoding: 'utf8',
  })
  // codesign -dv writes Authority lines to stderr; status is typically 0.
  const authDump = `${probed.stdout || ''}${probed.stderr || ''}`
  if (!/Authority=Developer ID Application:/.test(authDump)) {
    throw new Error(
      `${filePath} is not signed with Developer ID Application `
        + `(codesign -dv Authority missing). Notary will reject nested Chrome Libraries.`,
    )
  }
}

/**
 * Serially pre-sign heavy Mach-O trees that build.mac.signIgnore will skip.
 * Must run after restoreSidecarNodeModules (deps → node_modules).
 *
 * Driven by `resources/mac-sign-checklist.json` (single source of truth):
 * - `leaf-macho`: sign Mach-O leaves (python / node_modules; soft-fail by default)
 * - `leaf-then-bundles`: Playwright Chrome for Testing — **leaf-first** then seal
 *   nested .framework / .app deepest-first. Do **not** rely on `codesign --deep`.
 * After signing, `mustVerify` entries (libEGL / GLESv2 / swiftshader / Chrome.app / …)
 * are hard-checked for Developer ID — missing required globs throw (stale checklist
 * or incomplete stage).
 *
 * When bumping Playwright / Chromium (CFT), native .node/.dylib, or python layout,
 * update `mac-sign-checklist.json`.
 *
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
  // Checklist is the inventory for must-sign / must-verify.
  const checklist = loadMacSignChecklist()

  let signed = 0
  let skipped = 0
  console.log(`afterPack: pre-signing heavy Mach-O trees with identity: ${identity}`)

  /**
   * @param {string} file
   * @param {{ hardFail?: boolean }} [opts]
   */
  function signFile(file, opts = {}) {
    try {
      // Python ships versioned symlinks (python3.1 → …); soft-skip those only.
      // Playwright critical path must not silently skip — hardFail throws below.
      if (!opts.hardFail) {
        try {
          if (fs.lstatSync(file).isSymbolicLink()) {
            skipped += 1
            console.warn(`afterPack: pre-sign skipped symlink ${file}`)
            return
          }
        } catch {
          /* fall through to codesign */
        }
      }
      codesignTarget(file, identity)
      signed += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (opts.hardFail) {
        throw new Error(
          `afterPack: playwright pre-sign failed for ${file}: ${message.split('\n')[0]}`,
        )
      }
      skipped += 1
      console.warn(`afterPack: pre-sign skipped ${file}: ${message.split('\n')[0]}`)
    }
  }

  /**
   * @param {string} root
   * @param {{ hardFail?: boolean }} opts
   */
  function signLeafMachOs(root, opts = {}) {
    const files = walkFiles(root).filter(isMachOCandidate)
    console.log(
      `afterPack: pre-sign ${files.length} binaries under ${path.relative(resources, root)}`,
    )
    for (const file of files) signFile(file, opts)
    return files
  }

  /**
   * Leaf Mach-O first, then deepest-first nested .framework / .app seals.
   * @param {string} root
   */
  function signLeafThenBundles(root) {
    // 1) Leaf Mach-O first (Libraries/*.dylib, Helpers, chrome, …) — never rely on --deep.
    const leafMachOs = signLeafMachOs(root, { hardFail: true })
    console.log(
      `afterPack: playwright leaf-first pre-sign ${leafMachOs.length} Mach-O under ${path.relative(resources, root)}`,
    )

    // 2) Seal nested bundles deepest-first (Helpers → Framework → Chrome.app).
    // Leaves already signed; do not use --deep. Sealing frameworks *before* helper
    // .apps would invalidate the framework seal when helpers are re-signed after.
    const { apps, frameworks } = collectNestedBundles(root)
    const bundles = [
      ...frameworks.map((p) => ({ path: p, kind: 'framework' })),
      ...apps.map((p) => ({ path: p, kind: 'app' })),
    ].sort((a, b) => b.path.length - a.path.length)
    console.log(
      `afterPack: playwright seal bundles frameworks=${frameworks.length} apps=${apps.length} (deepest-first)`,
    )
    for (const bundle of bundles) {
      try {
        codesignTarget(bundle.path, identity)
        signed += 1
        console.log(`afterPack: sealed ${bundle.kind} ${path.relative(root, bundle.path)}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
          `afterPack: playwright ${bundle.kind} sign failed ${bundle.path}: ${message.split('\n')[0]}`,
        )
      }
    }
  }

  for (const tree of checklist.signTrees) {
    const root = path.join(resources, ...String(tree.rel).split('/'))
    if (!fs.existsSync(root)) {
      console.log(`afterPack: skip signTree "${tree.id}" (missing ${tree.rel})`)
      continue
    }
    const hardFail = Boolean(tree.hardFail)
    if (tree.mode === 'leaf-then-bundles') {
      signLeafThenBundles(root)
    } else {
      // Default / "leaf-macho"
      signLeafMachOs(root, { hardFail })
    }
  }

  // 3) Checklist-driven hard verify (libEGL / GLESv2 / swiftshader / Chrome.app / …).
  // required:true with 0 hits → throw (do not soft-skip like the old regex path).
  const { checked } = assertMustVerifySigned(resources, checklist, assertDeveloperIdSigned)
  console.log(`afterPack: mustVerify Developer ID checks passed (checked=${checked})`)

  console.log(`afterPack: heavy-tree pre-sign done (signed=${signed}, skipped=${skipped})`)
}

/**
 * Move pre-signed heavy trees out of the .app so @electron/osx-sign walkAsync
 * (Promise.all + isBinaryFile on every file) does not hit EMFILE before signIgnore.
 * afterSign restores them, re-seals the outer .app, then notarizes+staples
 * (builder's early notarize is disabled via `build.mac.notarize: false`).
 * @param {{ electronPlatformName: string; appOutDir: string; packager: { appInfo: { productFilename: string } } }} context
 * @param {string} identity
 */
function stashHeavyTreesForOsxSign(context, identity) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.OPPTRIX_MAC_UNSIGNED === '1') return
  if (!identity) return

  const { STASH_DIRNAME, MANIFEST } = require('./after-sign-restore-heavy.cjs')
  const appName = context.packager.appInfo.productFilename
  const resources = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources')
  const stashRoot = path.join(context.appOutDir, STASH_DIRNAME)
  if (fs.existsSync(stashRoot)) {
    fs.rmSync(stashRoot, { recursive: true, force: true })
  }
  fs.mkdirSync(stashRoot, { recursive: true })

  const items = []
  for (const rel of ['python', 'runtime-stage/node_modules', 'runtime-stage/playwright-browsers']) {
    const from = path.join(resources, rel)
    if (!fs.existsSync(from)) continue
    const stashName = rel.replace(/\//g, '__')
    const to = path.join(stashRoot, stashName)
    fs.renameSync(from, to)
    items.push({ rel, stashName })
    console.log(`afterPack: stashed ${rel} → ${STASH_DIRNAME}/${stashName} (avoid osx-sign EMFILE)`)
  }

  if (items.length === 0) {
    fs.rmSync(stashRoot, { recursive: true, force: true })
    return
  }

  fs.writeFileSync(
    path.join(stashRoot, MANIFEST),
    JSON.stringify({ identity, items }, null, 2),
    'utf8',
  )
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
  const identity = resolveMacSigningIdentity()
  preSignHeavyMacTrees(context)
  // Stash only when Developer ID signing will run (osx-sign walk EMFILE).
  if (
    context.electronPlatformName === 'darwin'
    && process.env.OPPTRIX_MAC_UNSIGNED !== '1'
    && identity
  ) {
    stashHeavyTreesForOsxSign(context, identity)
  }
  adhocSignMac(context)
}

// Exported for lightweight plist-strip smoke tests (not used by electron-builder).
exports.stripMacBundleIconName = stripMacBundleIconName
exports.ensurePackagedScheduleHelper = ensurePackagedScheduleHelper
exports.preSignHeavyMacTrees = preSignHeavyMacTrees
exports.isMachOCandidate = isMachOCandidate
