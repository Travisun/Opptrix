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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '../..')
const require = createRequire(path.join(DESKTOP_ROOT, 'package.json'))

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

  if (!pkg.build?.electronVersion) fail('build.electronVersion missing')
  else ok(`electronVersion=${pkg.build.electronVersion}`)

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

  const mainSrc = read('electron/main.cjs')
  if (!mainSrc.includes('RUNTIME_DEPS_DIR') || !mainSrc.includes('NODE_PATH')) {
    fail('main.cjs sidecarEnv must set NODE_PATH to RUNTIME_DEPS_DIR')
  } else ok('main.cjs NODE_PATH wired to RUNTIME_DEPS_DIR')

  const afterPackSrc = read('scripts/after-pack-adhoc.cjs')
  if (!afterPackSrc.includes('restoreSidecarNodeModules') || !afterPackSrc.includes('renameSync')) {
    fail('afterPack must rename staged deps → node_modules for ESM resolution')
  } else ok('afterPack restores deps → node_modules')
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
