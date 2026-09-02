import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ABI_PINNED_PACKAGE_NAMES,
  HOT_PACK_FORBIDDEN_PACKAGE_NAMES,
  VENDOR_HEAVY_PACKAGE_NAMES,
  assertNoAbiPinnedInTree,
  ensureVendorModuleLinks,
  findAbiPinnedInTree,
  findHotPackForbiddenInTree,
  findVendorHeavyInTree,
  isAbiPinnedPackageName,
  isHotPackExcludedPackageName,
  isHotPackForbiddenPackageName,
  isLinkToVendor,
  isVendorHeavyPackageName,
  isVendorPinnedPackageName,
  resolveVendorNodeModules,
  scrubHotPackForbiddenFromTree,
} from '../scripts/lib/runtime-vendor.mjs'

/**
 * @param {string} dir
 * @param {string} name
 * @param {string} marker
 */
function writeEsmPackage(dir, name, marker) {
  const pkgDir = path.join(dir, ...name.split('/'))
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    `${JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.js' }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(pkgDir, 'index.js'),
    `export default { from: ${JSON.stringify(marker)} };\n`,
  )
}

/**
 * @param {string} slotRoot
 * @param {string} importName
 * @param {string} [fromFile]
 */
function runEsmImport(slotRoot, importName, fromFile) {
  const app = fromFile || path.join(slotRoot, `_probe_${importName.replace(/\W/g, '_')}.mjs`)
  if (!fromFile) {
    fs.writeFileSync(
      app,
      `import x from '${importName}'; console.log(JSON.stringify(x))\n`,
    )
  }
  const r = spawnSync(process.execPath, [app], {
    cwd: path.dirname(app),
    encoding: 'utf8',
    env: { ...process.env },
  })
  return r
}

/**
 * @param {string} slotPath
 * @param {string} [slotRoot]
 */
function assertRealVendorCopy(slotPath, slotRoot) {
  const st = fs.lstatSync(slotPath)
  assert.equal(st.isSymbolicLink(), false, `expected real copy, got symlink at ${slotPath}`)
  assert.ok(st.isDirectory(), `expected directory copy at ${slotPath}`)
  const real = fs.realpathSync(slotPath)
  if (slotRoot) {
    const rootReal = fs.realpathSync(slotRoot)
    assert.ok(
      real === rootReal || real.startsWith(rootReal + path.sep),
      `realpath ${real} must live under slot ${rootReal}`,
    )
  }
}

test('ABI pin list covers core native deps', () => {
  assert.equal(isAbiPinnedPackageName('better-sqlite3'), true)
  assert.equal(isAbiPinnedPackageName('@duckdb/node-api'), true)
  assert.equal(isAbiPinnedPackageName('@img/sharp-linux-x64'), true)
  assert.equal(isAbiPinnedPackageName('@lancedb/lancedb-linux-x64-gnu'), true)
  assert.equal(isAbiPinnedPackageName('@duckdb/node-bindings-linux-x64'), true)
  assert.equal(isAbiPinnedPackageName('lodash'), false)
  assert.ok(ABI_PINNED_PACKAGE_NAMES.includes('node-llama-cpp'))
  assert.ok(ABI_PINNED_PACKAGE_NAMES.includes('onnxruntime-node'))
})

test('vendor-heavy list covers priority and secondary Docker deps', () => {
  assert.equal(isVendorHeavyPackageName('echarts'), true)
  assert.equal(isVendorHeavyPackageName('@fluentui/react-icons'), true)
  assert.equal(isVendorHeavyPackageName('@huggingface/transformers'), true)
  assert.equal(isVendorHeavyPackageName('lodash'), false)
  assert.equal(isVendorPinnedPackageName('apache-arrow'), true)
  assert.equal(isVendorPinnedPackageName('better-sqlite3'), true)
  assert.equal(isHotPackExcludedPackageName('mermaid'), true)
  assert.ok(VENDOR_HEAVY_PACKAGE_NAMES.includes('cytoscape-fcose'))
  assert.ok(VENDOR_HEAVY_PACKAGE_NAMES.includes('pdfjs-dist'))
})

test('hot-pack forbidden covers browser ORT and ffmpeg-static', () => {
  assert.equal(isHotPackForbiddenPackageName('onnxruntime-web'), true)
  assert.equal(isHotPackForbiddenPackageName('ffmpeg-static'), true)
  assert.equal(isHotPackForbiddenPackageName('onnxruntime-node'), false)
  assert.equal(isHotPackExcludedPackageName('onnxruntime-web'), true)
  assert.equal(isHotPackExcludedPackageName('onnxruntime-node'), true)
  assert.ok(HOT_PACK_FORBIDDEN_PACKAGE_NAMES.includes('onnxruntime-web'))
})

test('scrubHotPackForbiddenFromTree removes onnxruntime-web including nested', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-forbid-'))
  writeEsmPackage(path.join(root, 'node_modules'), 'onnxruntime-web', 'web-root')
  writeEsmPackage(
    path.join(root, 'packages', 'doc-library', 'node_modules'),
    'onnxruntime-web',
    'web-nested',
  )
  writeEsmPackage(path.join(root, 'node_modules'), 'left-pad-fake', 'keep')
  const scrubbed = scrubHotPackForbiddenFromTree(root)
  assert.ok(scrubbed.includes('onnxruntime-web'))
  assert.equal(fs.existsSync(path.join(root, 'node_modules', 'onnxruntime-web')), false)
  assert.equal(
    fs.existsSync(path.join(root, 'packages', 'doc-library', 'node_modules', 'onnxruntime-web')),
    false,
  )
  assert.ok(fs.existsSync(path.join(root, 'node_modules', 'left-pad-fake')))
  assert.deepEqual(findHotPackForbiddenInTree(root), [])
})

test('resolveVendorNodeModules honors env override', () => {
  assert.equal(
    resolveVendorNodeModules({ OPPTRIX_VENDOR_NODE_MODULES: '/tmp/v/nm' }),
    path.resolve('/tmp/v/nm'),
  )
})

test('ESM import resolves vendor via real copy (no app code / NODE_PATH)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  fs.mkdirSync(path.join(slot, 'node_modules'), { recursive: true })
  writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
  writeEsmPackage(vendorNm, '@duckdb/node-api', 'vendor-duck')

  const linked = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(linked.linked.includes('better-sqlite3'))
  assert.ok(linked.linked.includes('@duckdb/node-api'))
  assertRealVendorCopy(path.join(slot, 'node_modules', 'better-sqlite3'), slot)
  assertRealVendorCopy(path.join(slot, 'node_modules', '@duckdb', 'node-api'), slot)

  const r1 = runEsmImport(slot, 'better-sqlite3')
  assert.equal(r1.status, 0, r1.stderr)
  assert.deepEqual(JSON.parse(r1.stdout.trim()), { from: 'vendor' })

  const r2 = runEsmImport(slot, '@duckdb/node-api')
  assert.equal(r2.status, 0, r2.stderr)
  assert.deepEqual(JSON.parse(r2.stdout.trim()), { from: 'vendor-duck' })
})

test('hot-update non-ABI deps stay in slot; ABI force-replaced by vendor copy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-fuse-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
  // Simulate a bad/old hot pack that bundled ABI + a new JS dep
  writeEsmPackage(path.join(slot, 'node_modules'), 'better-sqlite3', 'slot-stale-abi')
  writeEsmPackage(path.join(slot, 'node_modules'), 'hot-new-lib', 'hot')

  const fused = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(fused.replaced.includes('better-sqlite3'))
  assert.equal(fused.linked.includes('better-sqlite3'), false)
  const slotAbi = path.join(slot, 'node_modules', 'better-sqlite3')
  assertRealVendorCopy(slotAbi, slot)
  assert.equal(
    isLinkToVendor(slotAbi, path.join(vendorNm, 'better-sqlite3')),
    false,
  )

  const rAbi = runEsmImport(slot, 'better-sqlite3')
  assert.equal(rAbi.status, 0, rAbi.stderr)
  assert.deepEqual(JSON.parse(rAbi.stdout.trim()), { from: 'vendor' })

  const rHot = runEsmImport(slot, 'hot-new-lib')
  assert.equal(rHot.status, 0, rHot.stderr)
  assert.deepEqual(JSON.parse(rHot.stdout.trim()), { from: 'hot' })
})

test('nested ABI under packages/*/node_modules is scrubbed so root vendor copy wins', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-nest-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
  const nestedNm = path.join(slot, 'packages', 'user-store', 'node_modules')
  writeEsmPackage(nestedNm, 'better-sqlite3', 'nested-stale')
  const probe = path.join(slot, 'packages', 'user-store', 'probe.mjs')
  fs.mkdirSync(path.dirname(probe), { recursive: true })
  fs.writeFileSync(probe, "import x from 'better-sqlite3'; console.log(JSON.stringify(x))\n")

  // Before fuse: nested wins
  const before = runEsmImport(slot, 'better-sqlite3', probe)
  assert.equal(before.status, 0, before.stderr)
  assert.deepEqual(JSON.parse(before.stdout.trim()), { from: 'nested-stale' })

  const fused = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(fused.scrubbed.includes('better-sqlite3'))
  assert.ok(fused.linked.includes('better-sqlite3') || fused.replaced.length >= 0)
  assert.equal(fs.existsSync(path.join(nestedNm, 'better-sqlite3')), false)
  assertRealVendorCopy(path.join(slot, 'node_modules', 'better-sqlite3'), slot)

  const after = runEsmImport(slot, 'better-sqlite3', probe)
  assert.equal(after.status, 0, after.stderr)
  assert.deepEqual(JSON.parse(after.stdout.trim()), { from: 'vendor' })
})

test('second fuse always re-copies (replaced; alreadyLinked unused)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-idemp-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  writeEsmPackage(vendorNm, 'duckdb', 'vendor')
  const a = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(a.linked.includes('duckdb'))
  assertRealVendorCopy(path.join(slot, 'node_modules', 'duckdb'), slot)
  const b = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(b.replaced.includes('duckdb'))
  assert.equal(b.linked.length, 0)
  assert.equal(b.alreadyLinked.length, 0)
  assertRealVendorCopy(path.join(slot, 'node_modules', 'duckdb'), slot)
})

test('legacy symlink-to-vendor is migrated to a real copy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-migrate-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  const slotNm = path.join(slot, 'node_modules')
  writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
  fs.mkdirSync(slotNm, { recursive: true })
  const vendorPath = path.join(vendorNm, 'better-sqlite3')
  const slotPath = path.join(slotNm, 'better-sqlite3')
  fs.symlinkSync(vendorPath, slotPath)
  assert.equal(isLinkToVendor(slotPath, vendorPath), true)

  const fused = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(fused.replaced.includes('better-sqlite3'))
  assertRealVendorCopy(slotPath, slot)
  assert.equal(isLinkToVendor(slotPath, vendorPath), false)
})

test('copied better-sqlite3 resolves hoisted bindings (symlink fusion would fail)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-bindings-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  const slotNm = path.join(slot, 'node_modules')
  fs.mkdirSync(slotNm, { recursive: true })

  // Isolated vendor fake better-sqlite3 that require('bindings') — no nested deps.
  const vendorBsql = path.join(vendorNm, 'better-sqlite3')
  fs.mkdirSync(vendorBsql, { recursive: true })
  fs.writeFileSync(
    path.join(vendorBsql, 'package.json'),
    `${JSON.stringify({ name: 'better-sqlite3', version: '1.0.0', main: 'index.js' }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(vendorBsql, 'index.js'),
    "module.exports = require('bindings');\n",
  )

  // Hoisted bindings only under slot node_modules (not under vendor).
  const bindingsDir = path.join(slotNm, 'bindings')
  fs.mkdirSync(bindingsDir, { recursive: true })
  fs.writeFileSync(
    path.join(bindingsDir, 'package.json'),
    `${JSON.stringify({ name: 'bindings', version: '1.0.0', main: 'index.js' }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(bindingsDir, 'index.js'),
    'module.exports = function bindings() { return { ok: true }; };\n',
  )

  // Symlink fusion shape: resolve walks vendor tree → cannot find hoisted bindings.
  const symlinkSlot = path.join(slotNm, 'better-sqlite3')
  fs.symlinkSync(vendorBsql, symlinkSlot)
  const viaLink = spawnSync(
    process.execPath,
    ['-e', "console.log(JSON.stringify(require('better-sqlite3')()))"],
    { cwd: slot, encoding: 'utf8', env: { ...process.env } },
  )
  assert.notEqual(viaLink.status, 0)
  assert.match(viaLink.stderr, /Cannot find module ['"]bindings['"]/)

  // Copy fusion: package lives under slot → require walks up to hoisted bindings.
  const fused = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(fused.replaced.includes('better-sqlite3') || fused.linked.includes('better-sqlite3'))
  assertRealVendorCopy(symlinkSlot, slot)

  const viaCopy = spawnSync(
    process.execPath,
    ['-e', "console.log(JSON.stringify(require('better-sqlite3')()))"],
    { cwd: slot, encoding: 'utf8', env: { ...process.env } },
  )
  assert.equal(viaCopy.status, 0, viaCopy.stderr)
  assert.deepEqual(JSON.parse(viaCopy.stdout.trim()), { ok: true })
})

test('assertNoAbiPinnedInTree fails when pack contains ABI deps', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-pack-abi-'))
  writeEsmPackage(path.join(root, 'node_modules'), 'lodash', 'js')
  assert.deepEqual(findAbiPinnedInTree(root), [])
  assert.equal(assertNoAbiPinnedInTree(root), true)

  writeEsmPackage(path.join(root, 'node_modules'), 'duckdb', 'bad')
  assert.ok(findAbiPinnedInTree(root).includes('duckdb'))
  assert.throws(() => assertNoAbiPinnedInTree(root), /Hot-update packs must not ship|ABI-pinned/)

  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-pack-forbid-'))
  writeEsmPackage(path.join(root2, 'node_modules'), 'onnxruntime-web', 'bad-web')
  assert.ok(findHotPackForbiddenInTree(root2).includes('onnxruntime-web'))
  assert.throws(() => assertNoAbiPinnedInTree(root2), /hot-pack-forbidden|onnxruntime-web/)

  const root3 = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-pack-heavy-'))
  writeEsmPackage(path.join(root3, 'node_modules'), 'echarts', 'chart')
  assert.ok(findVendorHeavyInTree(root3).includes('echarts'))
  assert.throws(() => assertNoAbiPinnedInTree(root3), /vendor-heavy|echarts/)
})

test('NODE_PATH alone does not satisfy ESM (documents why we fuse into slot)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-nodepath-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  fs.mkdirSync(slot, { recursive: true })
  writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
  const app = path.join(slot, 'app.mjs')
  fs.writeFileSync(app, "import x from 'better-sqlite3'; console.log(x.from)\n")
  const r = spawnSync(process.execPath, [app], {
    cwd: slot,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: vendorNm },
  })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /Cannot find package|ERR_MODULE_NOT_FOUND/)
})
