/**
 * Vendor fuse lifecycle: seed / extract / activate / rollback use recursive copy
 * (not symlink); soft no-op when vendor missing.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

/**
 * @param {string} dir
 * @param {string} versionLabel
 */
function makeSeedTree(dir, versionLabel) {
  fs.mkdirSync(dir, { recursive: true })
  su.writeRuntimeMarker(dir, { version: versionLabel })
  const entry = path.join(dir, 'apps', 'server', 'dist')
  fs.mkdirSync(entry, { recursive: true })
  fs.writeFileSync(path.join(entry, 'index.js'), `export const v = ${JSON.stringify(versionLabel)}\n`)
}

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
 * @param {string} slotPath
 * @param {string} [slotRoot]
 */
function assertRealVendorCopy(slotPath, slotRoot) {
  const st = fs.lstatSync(slotPath)
  assert.equal(st.isSymbolicLink(), false, `expected real copy, got symlink at ${slotPath}`)
  assert.ok(st.isDirectory(), `expected directory copy at ${slotPath}`)
  if (slotRoot) {
    const real = fs.realpathSync(slotPath)
    const rootReal = fs.realpathSync(slotRoot)
    assert.ok(
      real === rootReal || real.startsWith(rootReal + path.sep),
      `realpath ${real} must live under slot ${rootReal}`,
    )
  }
}

before(async () => {
  su = await import('../packages/system-update/dist/index.js')
})

describe('vendor-fuse soft no-op', () => {
  it('missing vendor returns missingInVendor without throw', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-fuse-novendor-'))
    const slot = path.join(root, 'slot')
    fs.mkdirSync(slot, { recursive: true })
    const missing = path.join(root, 'no-such-vendor', 'node_modules')
    const r = su.ensureVendorModuleLinks(slot, missing)
    assert.ok(r.missingInVendor.length > 0)
    assert.equal(r.linked.length, 0)
    assert.equal(fs.existsSync(path.join(slot, 'node_modules', 'better-sqlite3')), false)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('fuseVendorAbiIntoSlot honors OPPTRIX_VENDOR_NODE_MODULES', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-fuse-env-'))
    const vendorNm = path.join(root, 'vendor', 'node_modules')
    const slot = path.join(root, 'slot')
    writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
    const prev = process.env.OPPTRIX_VENDOR_NODE_MODULES
    process.env.OPPTRIX_VENDOR_NODE_MODULES = vendorNm
    try {
      const r = su.fuseVendorAbiIntoSlot(slot)
      assert.ok(r.linked.includes('better-sqlite3'))
      assertRealVendorCopy(path.join(slot, 'node_modules', 'better-sqlite3'), slot)
    } finally {
      if (prev === undefined) delete process.env.OPPTRIX_VENDOR_NODE_MODULES
      else process.env.OPPTRIX_VENDOR_NODE_MODULES = prev
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('lifecycle APIs fuse ABI as real copy', () => {
  /** @type {string} */
  let tmpRoot
  /** @type {string} */
  let systemDir
  /** @type {string} */
  let vendorNm
  /** @type {string | undefined} */
  let prevSystemDir
  /** @type {string | undefined} */
  let prevVendor

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-fuse-life-'))
    systemDir = path.join(tmpRoot, 'system')
    vendorNm = path.join(tmpRoot, 'vendor', 'node_modules')
    writeEsmPackage(vendorNm, 'better-sqlite3', 'vendor')
    writeEsmPackage(vendorNm, 'duckdb', 'vendor-duck')
    prevSystemDir = process.env.OPPTRIX_SYSTEM_DIR
    prevVendor = process.env.OPPTRIX_VENDOR_NODE_MODULES
    process.env.OPPTRIX_SYSTEM_DIR = systemDir
    process.env.OPPTRIX_VENDOR_NODE_MODULES = vendorNm
  })

  after(() => {
    if (prevSystemDir === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prevSystemDir
    if (prevVendor === undefined) delete process.env.OPPTRIX_VENDOR_NODE_MODULES
    else process.env.OPPTRIX_VENDOR_NODE_MODULES = prevVendor
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('seedCurrentSlot fuses vendor into seeded slot (real copy)', () => {
    const seedRoot = path.join(tmpRoot, 'seed-v1')
    makeSeedTree(seedRoot, '1.0.0')
    const result = su.seedCurrentSlot({
      systemDir,
      seedRoot,
      version: '1.0.0',
    })
    assert.equal(result.seeded, true)
    const abi = path.join(result.slotPath, 'node_modules', 'better-sqlite3')
    assertRealVendorCopy(abi, result.slotPath)
    assert.equal(su.isLinkToVendor(abi, path.join(vendorNm, 'better-sqlite3')), false)
  })

  it('stageSeedVersionAsPending fuses pending slot', () => {
    const seedV2 = path.join(tmpRoot, 'seed-v2')
    makeSeedTree(seedV2, '2.0.0')
    const r = su.stageSeedVersionAsPending({
      systemDir,
      seedRoot: seedV2,
      version: '2.0.0',
    })
    assert.equal(r.skipped, false)
    assert.equal(r.pendingSet, true)
    assertRealVendorCopy(
      path.join(r.slotPath, 'node_modules', 'better-sqlite3'),
      r.slotPath,
    )
  })

  it('activatePending fuses new current slot', async () => {
    const activated = su.activatePending({ systemDir })
    assert.equal(activated.currentVersion, '2.0.0')
    assertRealVendorCopy(
      path.join(activated.slotPath, 'node_modules', 'duckdb'),
      activated.slotPath,
    )
  })

  it('rollbackToBackup fuses backup/current slot', async () => {
    const rb = await su.rollbackToBackup({ systemDir })
    assert.equal(rb.rolledBack, true)
    assert.equal(rb.toVersion, '1.0.0')
    assertRealVendorCopy(
      path.join(rb.slotPath, 'node_modules', 'better-sqlite3'),
      rb.slotPath,
    )
  })

  it('extractUpdateArchive fuses extracted slot as real copy', () => {
    const packDir = path.join(tmpRoot, 'pack-tree')
    makeSeedTree(packDir, '3.0.0')
    // Leave ABI out of pack (correct shape); fuse should copy from vendor.
    const archive = path.join(tmpRoot, 'update-3.0.0.tar.gz')
    const tar = spawnSync(
      'tar',
      ['-czf', archive, '-C', packDir, '.'],
      { encoding: 'utf8' },
    )
    assert.equal(tar.status, 0, tar.stderr)
    const sha = createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
    fs.writeFileSync(`${archive}.sha256`, `${sha}  update-3.0.0.tar.gz\n`)

    const extracted = su.extractUpdateArchive({
      archivePath: archive,
      version: '3.0.0',
      systemDir,
      markPending: true,
    })
    assert.equal(extracted.version, '3.0.0')
    const abi = path.join(extracted.slotPath, 'node_modules', 'better-sqlite3')
    assertRealVendorCopy(abi, extracted.slotPath)
    assert.equal(fs.lstatSync(abi).isSymbolicLink(), false)
  })
})

describe('scripts/lib/runtime-vendor.mjs re-exports dist vendor-fuse', () => {
  it('re-export resolves and matches package fuse behavior', async () => {
    const rv = await import(
      pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/runtime-vendor.mjs')).href,
    )
    assert.equal(typeof rv.ensureVendorModuleLinks, 'function')
    assert.equal(typeof rv.fuseVendorAbiIntoSlot, 'function')
    assert.ok(rv.ABI_PINNED_PACKAGE_NAMES.includes('better-sqlite3'))

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-rv-reexport-'))
    const vendorNm = path.join(root, 'vendor', 'node_modules')
    const slot = path.join(root, 'slot')
    writeEsmPackage(vendorNm, 'sharp', 'vendor')
    const fused = rv.ensureVendorModuleLinks(slot, vendorNm)
    assert.ok(fused.linked.includes('sharp'))
    assertRealVendorCopy(path.join(slot, 'node_modules', 'sharp'), slot)
    fs.rmSync(root, { recursive: true, force: true })
  })
})
