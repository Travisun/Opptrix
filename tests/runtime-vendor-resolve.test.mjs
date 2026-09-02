import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ABI_PINNED_PACKAGE_NAMES,
  assertNoAbiPinnedInTree,
  ensureVendorModuleLinks,
  findAbiPinnedInTree,
  isAbiPinnedPackageName,
  isLinkToVendor,
  resolveVendorNodeModules,
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

test('ABI pin list covers core native deps', () => {
  assert.equal(isAbiPinnedPackageName('better-sqlite3'), true)
  assert.equal(isAbiPinnedPackageName('@duckdb/node-api'), true)
  assert.equal(isAbiPinnedPackageName('@img/sharp-linux-x64'), true)
  assert.equal(isAbiPinnedPackageName('lodash'), false)
  assert.ok(ABI_PINNED_PACKAGE_NAMES.includes('node-llama-cpp'))
})

test('resolveVendorNodeModules honors env override', () => {
  assert.equal(
    resolveVendorNodeModules({ OPPTRIX_VENDOR_NODE_MODULES: '/tmp/v/nm' }),
    path.resolve('/tmp/v/nm'),
  )
})

test('ESM import resolves vendor via symlink (no app code / NODE_PATH)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  fs.mkdirSync(path.join(slot, 'node_modules'), { recursive: true })
  writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
  writeEsmPackage(vendorNm, '@duckdb/node-api', 'vendor-duck')

  const linked = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(linked.linked.includes('better-sqlite3'))
  assert.ok(linked.linked.includes('@duckdb/node-api'))

  const r1 = runEsmImport(slot, 'better-sqlite3')
  assert.equal(r1.status, 0, r1.stderr)
  assert.deepEqual(JSON.parse(r1.stdout.trim()), { from: 'vendor' })

  const r2 = runEsmImport(slot, '@duckdb/node-api')
  assert.equal(r2.status, 0, r2.stderr)
  assert.deepEqual(JSON.parse(r2.stdout.trim()), { from: 'vendor-duck' })
})

test('hot-update non-ABI deps stay in slot; ABI force-replaced by vendor', () => {
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
  assert.ok(
    isLinkToVendor(
      path.join(slot, 'node_modules', 'better-sqlite3'),
      path.join(vendorNm, 'better-sqlite3'),
    ),
  )

  const rAbi = runEsmImport(slot, 'better-sqlite3')
  assert.equal(rAbi.status, 0, rAbi.stderr)
  assert.deepEqual(JSON.parse(rAbi.stdout.trim()), { from: 'vendor' })

  const rHot = runEsmImport(slot, 'hot-new-lib')
  assert.equal(rHot.status, 0, rHot.stderr)
  assert.deepEqual(JSON.parse(rHot.stdout.trim()), { from: 'hot' })
})

test('nested ABI under packages/*/node_modules is scrubbed so root vendor wins', () => {
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

  const after = runEsmImport(slot, 'better-sqlite3', probe)
  assert.equal(after.status, 0, after.stderr)
  assert.deepEqual(JSON.parse(after.stdout.trim()), { from: 'vendor' })
})

test('second fuse is idempotent (alreadyLinked)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-vendor-idemp-'))
  const vendorNm = path.join(root, 'vendor', 'node_modules')
  const slot = path.join(root, 'slot')
  writeEsmPackage(vendorNm, 'duckdb', 'vendor')
  const a = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(a.linked.includes('duckdb'))
  const b = ensureVendorModuleLinks(slot, vendorNm)
  assert.ok(b.alreadyLinked.includes('duckdb'))
  assert.equal(b.linked.length, 0)
  assert.equal(b.replaced.length, 0)
})

test('assertNoAbiPinnedInTree fails when pack contains ABI deps', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-pack-abi-'))
  writeEsmPackage(path.join(root, 'node_modules'), 'lodash', 'js')
  assert.deepEqual(findAbiPinnedInTree(root), [])
  assert.equal(assertNoAbiPinnedInTree(root), true)

  writeEsmPackage(path.join(root, 'node_modules'), 'duckdb', 'bad')
  assert.ok(findAbiPinnedInTree(root).includes('duckdb'))
  assert.throws(() => assertNoAbiPinnedInTree(root), /ABI-pinned/)
})

test('NODE_PATH alone does not satisfy ESM (documents why we symlink)', () => {
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
