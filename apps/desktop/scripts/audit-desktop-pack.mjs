#!/usr/bin/env node
/**
 * Desktop packaging preflight audit (cheap, no full electron-builder).
 *
 * Catches known CI failure classes BEFORE spending 30–90 min on stage-runtime /
 * notarization:
 *  - updater vendor staging (nested deps like fs-extra; no node_modules path)
 *  - sidecar runtime-stage deps rename (deps/ not node_modules)
 *  - embedded update trust certs + custom verifier wiring
 *  - electron-builder files / asarUnpack / extraResources policy
 *  - CI verify scripts present and referenced from package.json / workflow
 *
 * Usage:
 *   node apps/desktop/scripts/audit-desktop-pack.mjs
 *   OPPTRIX_AUDIT_STAGE_UPDATER=1 node …   # also run stage-updater-deps.mjs
 *   OPPTRIX_AUDIT_REQUIRE_SIGN_SECRETS=1 … # fail if Opptrix/Win CSC env empty
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { UPDATER_ENTRY, UPDATER_VENDOR_DIR, UPDATER_ENTRY_MARKER } from './lib/updater-vendor-paths.mjs'
import { resolveRuntimeTarget } from './lib/runtime-target.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '../..')
const require = createRequire(path.join(DESKTOP_ROOT, 'package.json'))
const runtimeTarget = resolveRuntimeTarget()

const errors = []
const warnings = []

function ok(msg) {
  console.log(`  ✓ ${msg}`)
}

function fail(msg) {
  errors.push(msg)
  console.error(`  ✗ ${msg}`)
}

function warn(msg) {
  warnings.push(msg)
  console.warn(`  ! ${msg}`)
}

function read(rel) {
  return fs.readFileSync(path.join(DESKTOP_ROOT, rel), 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(DESKTOP_ROOT, rel))
}

console.log('audit-desktop-pack: start')

// ── 1. package.json build policy ───────────────────────────────────────────
{
  const pkg = JSON.parse(read('package.json'))
  const files = pkg.build?.files ?? []
  const unpack = pkg.build?.asarUnpack ?? []
  const extra = pkg.build?.extraResources ?? []
  const winPub = pkg.build?.win?.signtoolOptions?.publisherName

  if (!files.includes('build/updater-deps/**/*')) {
    fail('build.files missing build/updater-deps/**/*')
  } else ok('build.files includes updater-deps')

  if (files.some((e) => String(e).includes('build/updater-deps/node_modules'))) {
    fail('updater must not be staged under a directory named node_modules')
  } else ok('updater path avoids node_modules directory name')

  if (!files.includes('build/icons/**/*')) {
    fail('build.files missing build/icons/**/* (app + tray icons from prepare-icons)')
  } else ok('build.files includes build/icons')

  if (!files.some((e) => String(e).includes('electron/**'))) {
    fail('build.files must include electron/** (certs + update-signature)')
  } else ok('build.files includes electron/**')

  if (!unpack.some((e) => String(e).includes('build/updater-deps'))) {
    fail('asarUnpack must include build/updater-deps')
  } else ok('asarUnpack includes updater-deps')

  const runtimeExtra = extra.find((e) => e?.from === 'runtime-stage' && e?.to === 'runtime-stage')
  if (!runtimeExtra) {
    fail('extraResources must copy runtime-stage → runtime-stage')
  } else {
    ok('extraResources maps runtime-stage')
    const filter = runtimeExtra.filter ?? []
    if (!filter.includes('!**/.cache') && !filter.includes('!**/.cache/**')) {
      warn('extraResources should exclude .cache (notarization unpacks unsigned natives)')
    } else ok('extraResources excludes .cache')
  }

  if (winPub !== 'Opptrix') {
    warn(`win.signtoolOptions.publisherName is ${JSON.stringify(winPub)} (expected Opptrix for update trust CN)`)
  } else ok('Windows publisherName = Opptrix')

  const sensevoiceExtra = extra.find((e) => e?.from === 'resources/sensevoice' && e?.to === 'sensevoice')
  if (!sensevoiceExtra) {
    fail('extraResources must copy resources/sensevoice → sensevoice')
  } else {
    ok('extraResources maps sensevoice GGUF bundle')
    const filter = sensevoiceExtra.filter ?? []
    if (!filter.includes('**/*.gguf')) {
      fail('sensevoice extraResources filter must include **/*.gguf')
    } else ok('sensevoice extraResources filters *.gguf')
  }

  for (const gguf of ['sensevoice-small-q8.gguf', 'fsmn-vad.gguf']) {
    const rel = path.join('resources/sensevoice', gguf)
    if (!exists(rel)) {
      fail(`missing staged ${rel} — run node scripts/stage-sensevoice.mjs before packaging`)
    } else ok(`present ${rel}`)
  }

  const stageSensevoiceSrc = read('scripts/stage-sensevoice.mjs')
  if (!stageSensevoiceSrc.includes('sensevoice-small-q8.gguf') || !stageSensevoiceSrc.includes('fsmn-vad.gguf')) {
    fail('stage-sensevoice.mjs must stage q8 model and VAD')
  } else ok('stage-sensevoice.mjs stages required GGUF files')

  // ── Hybrid RAG (no-image): e5 ONNX + RapidOCR ONNX + engines MANIFEST ──
  const llmExtra = extra.find((e) => e?.from === 'resources/llms' && e?.to === 'llms')
  if (!llmExtra) {
    fail('Hybrid RAG: extraResources must copy resources/llms → llms (e5 + RapidOCR)')
  } else {
    ok('extraResources maps RAG / embedding model bundle under llms')
  }

  const e5Required = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/model_quantized.onnx',
  ]
  for (const file of e5Required) {
    const rel = path.join('resources/llms/multilingual-e5-small', file)
    if (!exists(rel)) {
      fail(
        `Hybrid RAG: missing e5 ${rel} (need ONNX + tokenizer) — run node scripts/stage-e5.mjs before packaging`,
      )
    } else ok(`present ${rel}`)
  }

  const stageE5Src = read('scripts/stage-e5.mjs')
  if (
    !stageE5Src.includes('model_quantized.onnx')
    || !stageE5Src.includes('tokenizer.json')
    || !stageE5Src.includes('multilingual-e5-small')
  ) {
    fail('stage-e5.mjs must stage multilingual-e5-small ONNX + tokenizer layout')
  } else ok('stage-e5.mjs stages required e5 files')

  const rapidocrRequired = [
    'ch_PP-OCRv4_det_mobile.onnx',
    'ch_PP-OCRv4_rec_mobile.onnx',
    'ch_ppocr_mobile_v2.0_cls_mobile.onnx',
    'ppocr_keys_v1.txt',
  ]
  for (const file of rapidocrRequired) {
    const rel = path.join('resources/llms/rapidocr-ppocrv4-mobile', file)
    if (!exists(rel)) {
      fail(
        `Hybrid RAG: missing RapidOCR ${rel} (need det/rec/cls ONNX + keys) — run node scripts/stage-rapidocr.mjs before packaging`,
      )
    } else ok(`present ${rel}`)
  }

  const stageRapidocrSrc = read('scripts/stage-rapidocr.mjs')
  if (
    !stageRapidocrSrc.includes('ch_PP-OCRv4_det_mobile.onnx')
    || !stageRapidocrSrc.includes('ch_PP-OCRv4_rec_mobile.onnx')
    || !stageRapidocrSrc.includes('ch_ppocr_mobile_v2.0_cls_mobile.onnx')
    || !stageRapidocrSrc.includes('ppocr_keys_v1.txt')
    || !stageRapidocrSrc.includes('rapidocr-ppocrv4-mobile')
    || !stageRapidocrSrc.includes('RapidAI/RapidOCR')
  ) {
    fail('stage-rapidocr.mjs must stage RapidOCR PP-OCRv4 mobile (3 ONNX + keys)')
  } else ok('stage-rapidocr.mjs stages required RapidOCR files')

  const enginesExtra = extra.find((e) => e?.from === 'resources/engines' && e?.to === 'engines')
  if (!enginesExtra) {
    fail('Hybrid RAG: extraResources must copy resources/engines → engines (MANIFEST compat)')
  } else {
    ok('extraResources maps engines stage dir')
  }

  // Respect OPPTRIX_RUNTIME_ARCH (mac-x64 cross-build must not look for darwin-arm64 MANIFEST)
  const platformKey = `${runtimeTarget.platform}-${runtimeTarget.arch}`
  const enginesManifestRel = path.join('resources/engines', platformKey, 'MANIFEST.json')
  if (!exists(enginesManifestRel)) {
    fail(
      `Hybrid RAG: missing ${enginesManifestRel} — run node scripts/stage-rag-engines.mjs `
        + `(writes MANIFEST for ${platformKey}; set OPPTRIX_RUNTIME_ARCH for cross-builds)`,
    )
  } else {
    ok(`present ${enginesManifestRel}`)
    try {
      const manifest = JSON.parse(read(enginesManifestRel))
      if (!Array.isArray(manifest.engines)) {
        fail('engines MANIFEST.json must include engines array')
      } else if (manifest.engines.length !== 0) {
        fail(
          `Hybrid RAG: engines MANIFEST.engines must be empty (got ${JSON.stringify(manifest.engines)}; no Python workers)`,
        )
      } else {
        ok('engines MANIFEST.engines=[] (no Python workers)')
      }
      const note = String(manifest.note ?? '')
      if (!/Node\s+(OCR|ONNX)/i.test(note)) {
        fail('engines MANIFEST.note must document Node OCR (no Python wheels)')
      } else {
        ok('engines MANIFEST.note documents Node OCR')
      }
    } catch {
      fail('engines MANIFEST.json is invalid JSON')
    }
  }

  // Fail if leftover Python worker trees / wheels were staged under resources/engines
  {
    const enginesAbs = path.join(DESKTOP_ROOT, 'resources/engines')
    const forbidden = []
    if (fs.existsSync(enginesAbs)) {
      const walk = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, ent.name)
          if (ent.isDirectory()) {
            if (ent.name === 'wheels' || /^(pdfplumber|rapidocr)-worker$/.test(ent.name)) {
              forbidden.push(path.relative(DESKTOP_ROOT, p))
            } else {
              walk(p)
            }
          } else if (/\.(whl|tar\.gz)$/i.test(ent.name) || ent.name === 'worker.py') {
            forbidden.push(path.relative(DESKTOP_ROOT, p))
          }
        }
      }
      walk(enginesAbs)
    }
    if (forbidden.length) {
      fail(
        `Hybrid RAG: resources/engines must not contain Python workers/wheels — found: ${forbidden.slice(0, 8).join(', ')}`,
      )
    } else {
      ok('resources/engines has no Python worker/wheel leftovers')
    }
  }

  if (!exists('scripts/stage-rag-engines.mjs')) {
    fail('scripts/stage-rag-engines.mjs missing')
  } else {
    const stageEnginesSrc = read('scripts/stage-rag-engines.mjs')
    const documentsNodeOcr = stageEnginesSrc.includes('Node OCR') || stageEnginesSrc.includes('Node ONNX')
    const downloadsPythonWheels = /pip\s+download/.test(stageEnginesSrc)
      || stageEnginesSrc.includes('downloadWheel')
    const respectsRuntimeArch = stageEnginesSrc.includes('resolveRuntimeTarget')
      || stageEnginesSrc.includes('OPPTRIX_RUNTIME_ARCH')
    if (!documentsNodeOcr) {
      fail('stage-rag-engines.mjs must document Node OCR path (MANIFEST-only staging)')
    } else if (downloadsPythonWheels) {
      fail('stage-rag-engines.mjs must not download Python pdfplumber/rapidocr wheels')
    } else if (!stageEnginesSrc.includes('pruneLegacyWorkers') && !stageEnginesSrc.includes('pdfplumber-worker')) {
      fail('stage-rag-engines.mjs must prune legacy Python worker dirs')
    } else if (!respectsRuntimeArch) {
      fail('stage-rag-engines.mjs must honor OPPTRIX_RUNTIME_ARCH (via resolveRuntimeTarget)')
    } else {
      ok('stage-rag-engines.mjs writes MANIFEST only (Node OCR; OPPTRIX_RUNTIME_ARCH-aware)')
    }
  }

  // Tray assets staged by prepare-icons into build/icons/tray (packaged via build/icons/**/*)
  {
    const trayRequired = [
      'trayTemplate.png',
      'trayTemplate@2x.png',
      'trayTemplate@3x.png',
      'tray.ico',
      'tray-color.png',
      'tray-color@1.25x.png',
      'tray-color@1.5x.png',
      'tray-color@2x.png',
    ]
    const traySrcDir = path.join(REPO_ROOT, 'icons/tray')
    const traySrcPresent = fs.existsSync(traySrcDir)
      && trayRequired.every((name) => {
        if (name === 'tray.ico') {
          // prepare-icons generates tray.ico from color PNGs; source may or may not commit it
          return fs.existsSync(path.join(traySrcDir, 'tray-color.png'))
        }
        return fs.existsSync(path.join(traySrcDir, name))
      })
    if (!traySrcPresent) {
      fail(
        'repo icons/tray missing required tray sources '
          + '(mac trayTemplate*.png + linux tray-color*.png) — restore icons/tray before packaging',
      )
    } else {
      ok('repo icons/tray has required tray sources')
    }
    const stagedTrayMissing = trayRequired.some((name) => !exists(path.join('build/icons/tray', name)))
    if (traySrcPresent && stagedTrayMissing) {
      console.log('  … running prepare-icons.mjs (staged tray assets missing)')
      const prepare = spawnSync(process.execPath, [path.join(__dirname, 'prepare-icons.mjs')], {
        cwd: DESKTOP_ROOT,
        stdio: 'inherit',
      })
      if (prepare.status !== 0) {
        fail('prepare-icons.mjs failed while staging tray assets')
      } else {
        ok('prepare-icons completed')
      }
    }
    for (const name of trayRequired) {
      const rel = path.join('build/icons/tray', name)
      if (!exists(rel)) {
        fail(`missing staged tray asset ${rel} — run node scripts/prepare-icons.mjs`)
      } else {
        ok(`present ${rel}`)
      }
    }
    const prepareIconsSrc = read('scripts/prepare-icons.mjs')
    if (!prepareIconsSrc.includes('stageTrayIcons') || !prepareIconsSrc.includes('trayTemplate.png')) {
      fail('prepare-icons.mjs must stage tray Template / color / ico assets')
    } else {
      ok('prepare-icons.mjs stages tray assets')
    }
  }

  // NSIS installer/uninstaller icons (hand-aligned icons/nsis/ → prepare-icons)
  {
    const nsisPngs = [
      'installer-16.png',
      'installer-32.png',
      'installer-48.png',
      'installer-256.png',
    ]
    const nsisSrcDir = path.join(REPO_ROOT, 'icons/nsis')
    const nsisSrcPresent = fs.existsSync(nsisSrcDir)
      && nsisPngs.every((name) => fs.existsSync(path.join(nsisSrcDir, name)))
    if (!nsisSrcPresent) {
      fail('repo icons/nsis missing installer-{16,32,48,256}.png — restore before packaging')
    } else {
      ok('repo icons/nsis has installer PNGs')
    }
    const nsisIcos = ['installerIcon.ico', 'uninstallerIcon.ico']
    const stagedNsisMissing = nsisIcos.some((name) => !exists(path.join('build/icons', name)))
    if (nsisSrcPresent && stagedNsisMissing) {
      console.log('  … running prepare-icons.mjs (staged NSIS icos missing)')
      const prepare = spawnSync(process.execPath, [path.join(__dirname, 'prepare-icons.mjs')], {
        cwd: DESKTOP_ROOT,
        stdio: 'inherit',
      })
      if (prepare.status !== 0) {
        fail('prepare-icons.mjs failed while staging NSIS icons')
      } else {
        ok('prepare-icons completed (NSIS)')
      }
    }
    for (const name of nsisIcos) {
      const rel = path.join('build/icons', name)
      if (!exists(rel)) {
        fail(`missing staged NSIS icon ${rel} — run node scripts/prepare-icons.mjs`)
      } else {
        ok(`present ${rel}`)
      }
    }
    const nsisCfg = pkg.build?.nsis
    if (
      nsisCfg?.installerIcon !== 'build/icons/installerIcon.ico'
      || nsisCfg?.uninstallerIcon !== 'build/icons/uninstallerIcon.ico'
      || nsisCfg?.installerHeaderIcon !== 'build/icons/installerIcon.ico'
    ) {
      fail('build.nsis must point installer/uninstaller/header icons at build/icons/installerIcon.ico (+ uninstallerIcon.ico)')
    } else {
      ok('build.nsis installer/uninstaller icons wired')
    }
    const prepareIconsSrc = read('scripts/prepare-icons.mjs')
    if (!prepareIconsSrc.includes('createNsisIcons') || !prepareIconsSrc.includes('installerIcon.ico')) {
      fail('prepare-icons.mjs must generate installerIcon.ico / uninstallerIcon.ico from icons/nsis')
    } else {
      ok('prepare-icons.mjs stages NSIS icons')
    }
  }

  // Sidecar env is built in sidecar-launch.cjs (shared by main UI + headless OS tick).
  const sidecarLaunchSrc = read('electron/os-schedule/sidecar-launch.cjs')
  if (!sidecarLaunchSrc.includes('OPPTRIX_RAG_ENGINES_BUNDLED_DIR')) {
    fail('sidecar-launch.cjs must inject OPPTRIX_RAG_ENGINES_BUNDLED_DIR for sidecar')
  } else ok('sidecar-launch.cjs injects OPPTRIX_RAG_ENGINES_BUNDLED_DIR')

  if (!pkg.scripts?.['build']?.includes('prebuild.mjs')) {
    warn('desktop build script should run prebuild.mjs (includes stage-sensevoice / stage-e5 / stage-rapidocr / stage-rag-engines)')
  }

  const prebuildSrc = read('scripts/prebuild.mjs')
  const prebuildOrder = [
    'stage-sensevoice.mjs',
    'stage-e5.mjs',
    'stage-rapidocr.mjs',
    'stage-rag-engines.mjs',
    'audit-desktop-pack.mjs',
  ]
  let lastIdx = -1
  for (const name of prebuildOrder) {
    const idx = prebuildSrc.indexOf(name)
    if (idx < 0) {
      fail(`prebuild.mjs must run ${name} before packaging`)
    } else if (idx < lastIdx) {
      fail(`prebuild.mjs must run ${name} after prior Hybrid RAG stage steps`)
    } else {
      lastIdx = idx
      ok(`prebuild runs ${name}`)
    }
  }

  if (!pkg.build?.electronVersion) fail('build.electronVersion missing')
  else ok(`electronVersion=${pkg.build.electronVersion}`)

  const debDepends = pkg.build?.deb?.depends ?? []
  for (const dep of ['bubblewrap', 'socat', 'ripgrep']) {
    if (!debDepends.includes(dep)) {
      fail(`build.deb.depends must include ${dep} for Linux shell sandbox`)
    } else ok(`deb depends includes ${dep}`)
  }

  for (const script of [
    'verify:release-metadata-policy',
    'verify:packaged-updater',
    'verify:packaged-runtime',
    'audit:desktop-pack',
  ]) {
    if (!pkg.scripts?.[script]) fail(`package.json scripts missing ${script}`)
    else ok(`script ${script}`)
  }
}

// ── 2. Sidecar deps rename (electron-builder skips top-level node_modules) ──
{
  const { RUNTIME_DEPS_DIR } = require('./electron/runtime-deps.cjs')
  if (RUNTIME_DEPS_DIR === 'node_modules') {
    fail('RUNTIME_DEPS_DIR must not be node_modules (electron-builder createFilter skips it)')
  } else if (RUNTIME_DEPS_DIR !== 'deps') {
    warn(`RUNTIME_DEPS_DIR=${RUNTIME_DEPS_DIR} (canonical is deps)`)
  } else ok('RUNTIME_DEPS_DIR=deps')

  const stageSrc = read('scripts/stage-runtime.mjs')
  if (!stageSrc.includes('renameSync') || !stageSrc.includes('RUNTIME_DEPS_DIR')) {
    fail('stage-runtime.mjs must rename node_modules → RUNTIME_DEPS_DIR before packaging')
  } else ok('stage-runtime renames node_modules → deps')
  if (!stageSrc.includes('assertSandboxRuntimeVendor')) {
    fail('stage-runtime.mjs must assert @anthropic-ai/sandbox-runtime vendor (srt-win + seccomp)')
  } else ok('stage-runtime asserts sandbox-runtime vendor')

  const mainSrc = read('electron/main.cjs')
  if (!mainSrc.includes('RUNTIME_DEPS_DIR') || !mainSrc.includes('NODE_PATH')) {
    fail('main.cjs sidecarEnv must set NODE_PATH to RUNTIME_DEPS_DIR')
  } else ok('main.cjs NODE_PATH wired to RUNTIME_DEPS_DIR')

  const afterPackSrc = read('scripts/after-pack-adhoc.cjs')
  if (!afterPackSrc.includes('restoreSidecarNodeModules') || !afterPackSrc.includes('renameSync')) {
    fail('afterPack must rename staged deps → node_modules for ESM resolution')
  } else ok('afterPack restores deps → node_modules')

  if (
    !afterPackSrc.includes('restoreMacBundleIcns')
    || !afterPackSrc.includes('build/icons/icon.icns')
  ) {
    fail('afterPack must restore full build/icons/icon.icns over mac bundle stub')
  } else ok('afterPack restores full mac icon.icns for notification center')

  if (
    !afterPackSrc.includes('CFBundleIconName')
    || !afterPackSrc.includes('stripMacBundleIconName')
  ) {
    fail('afterPack must strip CFBundleIconName so NC falls back to restored icon.icns')
  } else ok('afterPack strips CFBundleIconName (Asset Catalog) for notification center')

  if (exists('build/icons/icon.icns')) {
    const icnsSize = fs.statSync(path.join(DESKTOP_ROOT, 'build/icons/icon.icns')).size
    if (icnsSize < 100_000) {
      fail(`build/icons/icon.icns looks like a stub (${icnsSize} bytes; expect >= 100000)`)
    } else ok(`build/icons/icon.icns size ok (${icnsSize} bytes)`)
  }

  const notifSrc = read('electron/notifications.cjs')
  const iconSrc = read('electron/icon.cjs')
  if (!notifSrc.includes('resolveAppIconPath') || !notifSrc.includes('icon:')) {
    fail('notifications.cjs must pass resolveAppIconPath() as Notification.icon (Win/Linux toast)')
  } else ok('notifications.cjs wires Notification.icon from resolveAppIconPath')
  if (!iconSrc.includes('icon.ico') || !iconSrc.includes('linux')) {
    fail('icon.cjs must prefer platform icons (win icon.ico / linux PNG)')
  } else ok('icon.cjs prefers platform-native toast/app icons')
}

// ── 3. Update trust (embedded CA + custom verifier) ────────────────────────
{
  const trustPath = 'electron/certs/opptrix-update-trust.json'
  if (!exists(trustPath)) fail(`missing ${trustPath}`)
  else {
    const trust = JSON.parse(read(trustPath))
    for (const key of ['publisherCommonName', 'rootCaFile', 'codeSigningCertFile']) {
      if (!trust[key]) fail(`trust.json missing ${key}`)
    }
    if (!exists(`electron/certs/${trust.rootCaFile}`)) fail(`missing root CA ${trust.rootCaFile}`)
    else ok(`root CA present (${trust.rootCaFile})`)
    if (!exists(`electron/certs/${trust.codeSigningCertFile}`)) {
      fail(`missing leaf cert ${trust.codeSigningCertFile}`)
    } else ok(`leaf cert present (${trust.codeSigningCertFile})`)
    if (trust.publisherCommonName !== 'Opptrix') {
      warn(`trust publisherCommonName=${trust.publisherCommonName}`)
    }
  }

  if (!exists('electron/update-signature.cjs')) fail('missing electron/update-signature.cjs')
  else {
    const sig = require('./electron/update-signature.cjs')
    for (const fn of [
      'installCustomUpdateSignatureVerification',
      'verifyWindowsUpdateCodeSignature',
      'verifyLinuxUpdateArtifact',
    ]) {
      if (typeof sig[fn] !== 'function') fail(`update-signature missing export ${fn}`)
      else ok(`update-signature.${fn}`)
    }
  }

  const updaterSrc = read('electron/updater.cjs')
  if (!updaterSrc.includes('update-signature') || !updaterSrc.includes('installCustomUpdateSignatureVerification')) {
    fail('updater.cjs must install custom update signature verification')
  } else ok('updater.cjs installs custom signature verification')

  const verifySrc = read('scripts/verify-runtime.mjs')
  if (!verifySrc.includes('ensureStageNodeModulesLink') && !verifySrc.includes("symlinkSync")) {
    fail('verify-runtime must link STAGE/node_modules → deps (avoid monorepo ABI pollution)')
  } else ok('verify-runtime links node_modules → deps for resolution')
  const ragNativeNeedles = ['sharp', 'onnxruntime-node', '@lancedb/lancedb']
  if (!ragNativeNeedles.every((n) => verifySrc.includes(n)) || !verifySrc.includes('assertRagNativeImports')) {
    fail(
      'verify-runtime must smoke-import RAG natives '
        + '(sharp / onnxruntime-node / @lancedb/lancedb) under ELECTRON_RUN_AS_NODE',
    )
  } else ok('verify-runtime covers RAG native imports')
}

// ── 4. Updater vendor staging resolve (fs-extra class of bugs) ─────────────
{
  let updaterRoot
  try {
    updaterRoot = path.dirname(require.resolve('electron-updater/package.json'))
    ok(`electron-updater resolve → ${path.relative(REPO_ROOT, updaterRoot)}`)
  } catch (err) {
    fail(`cannot resolve electron-updater: ${err instanceof Error ? err.message : err}`)
  }

  if (updaterRoot) {
    const nestedFsExtra = path.join(updaterRoot, 'node_modules/fs-extra/package.json')
    try {
      require.resolve('fs-extra/package.json')
      ok('fs-extra resolvable from desktop package root')
    } catch {
      if (fs.existsSync(nestedFsExtra)) {
        ok('fs-extra nested under electron-updater (stage-updater-deps must resolve from parent)')
      } else {
        fail('fs-extra missing — stage-updater-deps will fail on CI (add dependency or fix nest resolve)')
      }
    }

    const stageSrc = read('scripts/stage-updater-deps.mjs')
    if (!stageSrc.includes('resolveFromDir') && !stageSrc.includes('copyPackage(dep, copied, pkgDir)')) {
      fail('stage-updater-deps must resolve nested deps from parent package dir')
    } else ok('stage-updater-deps resolves nested deps from parent')
    if (!stageSrc.includes("fs-extra")) {
      warn('stage-updater-deps should assert fs-extra was staged')
    }
  }
}

// ── 5. Workflow / scripts presence ─────────────────────────────────────────
{
  const releaseWf = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/release-desktop.yml'), 'utf8')
  for (const needle of [
    'verify-packaged-updater.mjs',
    'verify-packaged-runtime.mjs',
    'audit-desktop-pack.mjs',
    'OPPTRIX_CODE_SIGNING_P12',
    'verify-release-metadata-policy.mjs',
  ]) {
    if (!releaseWf.includes(needle)) fail(`release-desktop.yml missing ${needle}`)
    else ok(`release workflow mentions ${needle}`)
  }

  const ciWf = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')
  if (!ciWf.includes('audit-desktop-pack.mjs')) {
    fail('ci.yml must run audit-desktop-pack.mjs before build/test')
  } else ok('ci.yml runs audit-desktop-pack')
  if (!ciWf.includes('prepare:fonts') && !ciWf.includes('prepare-ui-fonts')) {
    fail('ci.yml must run prepare:fonts before UI build')
  } else ok('ci.yml runs prepare:fonts')
  if (!releaseWf.includes('prepare:fonts') && !releaseWf.includes('prepare-ui-fonts')) {
    fail('release-desktop.yml must run prepare:fonts before desktop/UI build')
  } else ok('release-desktop.yml runs prepare:fonts')
  for (const [label, wf] of [
    ['ci.yml', ciWf],
    ['release-desktop.yml', releaseWf],
  ]) {
    if (/RAG engine wheels/i.test(wf)) {
      fail(`${label} must not name stage-rag-engines as wheels (Node OCR MANIFEST only)`)
    } else if (!wf.includes('stage-rag-engines.mjs')) {
      fail(`${label} must run stage-rag-engines.mjs`)
    } else if (!wf.includes('stage-e5.mjs') || !wf.includes('stage-rapidocr.mjs')) {
      fail(`${label} must stage e5 + RapidOCR before audit`)
    } else {
      ok(`${label} Hybrid RAG stage order (e5 / RapidOCR / engines MANIFEST)`)
    }
  }

  for (const rel of [
    'scripts/verify-packaged-updater.mjs',
    'scripts/verify-packaged-runtime.mjs',
    'scripts/verify-runtime.mjs',
    'scripts/stage-runtime.mjs',
    'scripts/stage-updater-deps.mjs',
    'scripts/sign-update-artifact.mjs',
  ]) {
    if (!exists(rel)) fail(`missing ${rel}`)
    else ok(`present ${rel}`)
  }
}

// ── 5b. UI fonts prepare wiring (source-han-alias generated, not committed) ─
{
  const rootPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
  const clientPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'client-ui/package.json'), 'utf8'))
  const fontsCss = path.join(REPO_ROOT, 'client-ui/src/styles/fonts.css')
  const prepareScript = path.join(REPO_ROOT, 'scripts/prepare-ui-fonts.mjs')

  if (rootPkg.scripts?.['prepare:fonts'] !== 'node scripts/prepare-ui-fonts.mjs') {
    fail('root package.json must define prepare:fonts → node scripts/prepare-ui-fonts.mjs')
  } else ok('root prepare:fonts script')

  if (!String(rootPkg.scripts?.build ?? '').includes('prepare:fonts')) {
    fail('root build script must run prepare:fonts before client-ui build')
  } else ok('root build runs prepare:fonts')

  if (!String(clientPkg.scripts?.prebuild ?? '').includes('prepare-ui-fonts')) {
    fail('client-ui package.json prebuild must run prepare-ui-fonts.mjs')
  } else ok('client-ui prebuild prepares fonts')

  if (!fs.existsSync(prepareScript)) {
    fail('missing scripts/prepare-ui-fonts.mjs')
  } else ok('present prepare-ui-fonts.mjs')

  if (!fs.existsSync(fontsCss)) {
    fail('missing client-ui/src/styles/fonts.css (must be committed)')
  } else {
    const css = fs.readFileSync(fontsCss, 'utf8')
    if (!css.includes('source-han-alias.css')) {
      fail('fonts.css must import source-han-alias.css')
    } else ok('fonts.css imports source-han-alias')
  }
}

// ── 6. Optional: require signing secret env (release CI) ───────────────────
if (process.env.OPPTRIX_AUDIT_REQUIRE_SIGN_SECRETS === '1') {
  const hasWin = Boolean(process.env.WIN_CSC_LINK || process.env.OPPTRIX_CODE_SIGNING_P12)
  if (!hasWin) {
    fail('OPPTRIX_AUDIT_REQUIRE_SIGN_SECRETS=1 but neither WIN_CSC_LINK nor OPPTRIX_CODE_SIGNING_P12 is set')
  } else ok('Windows Authenticode material env present')
} else {
  ok('sign-secret hard requirement skipped (set OPPTRIX_AUDIT_REQUIRE_SIGN_SECRETS=1 on release)')
}

// ── 7. Optional: actually stage updater deps ───────────────────────────────
if (process.env.OPPTRIX_AUDIT_STAGE_UPDATER === '1') {
  console.log('  … running stage-updater-deps.mjs')
  const r = spawnSync(process.execPath, [path.join(__dirname, 'stage-updater-deps.mjs')], {
    cwd: DESKTOP_ROOT,
    stdio: 'inherit',
  })
  if (r.status !== 0) fail('stage-updater-deps.mjs failed')
  else {
    ok('stage-updater-deps completed')
    if (!fs.existsSync(path.join(UPDATER_VENDOR_DIR, UPDATER_ENTRY, 'package.json'))) {
      fail(`missing staged ${UPDATER_ENTRY_MARKER}`)
    } else ok(`staged ${UPDATER_ENTRY_MARKER}`)
    if (!fs.existsSync(path.join(UPDATER_VENDOR_DIR, 'fs-extra', 'package.json'))) {
      fail('staged tree missing fs-extra')
    } else ok('staged fs-extra')
  }
} else {
  ok('updater stage skipped (set OPPTRIX_AUDIT_STAGE_UPDATER=1 to execute)')
}

console.log('')
if (warnings.length) {
  console.log(`audit-desktop-pack: ${warnings.length} warning(s)`)
}
if (errors.length) {
  console.error(`audit-desktop-pack: FAILED (${errors.length} error(s))`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('audit-desktop-pack: OK')
