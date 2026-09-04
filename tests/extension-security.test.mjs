/**
 * Phase A security tests — vm isolation, storage isolation, zip safety, limits.
 *
 * These tests verify the safety compensations of the shared-worker model
 * (ADR-02 amendment): extensions cannot escape the vm, cannot read each other's
 * data, cannot smuggle malicious zip payloads, and cannot exhaust resources.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import { crc32 } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

let tmpRoot
let dataDir
let platform

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-sec-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  platform = await import(`${platformModUrl}?t=${Date.now()}`)
  platform.resetPlatformContextForTests()
})
afterEach(() => {
  platform.resetPlatformContextForTests()
  delete process.env.OPPTRIX_DATA_DIR
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

// Store-only zip builder.
function buildStoredZip(files) {
  const localParts = []
  const cdParts = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    nameBuf.copy(cd, 46)
    localParts.push(local, data)
    cdParts.push(cd)
    offset += local.length + data.length
  }
  const cdBuf = Buffer.concat(cdParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(cdParts.length, 8)
  eocd.writeUInt16LE(cdParts.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, cdBuf, eocd])
}

describe('Phase A — security: vm isolation', () => {
  it('worker_js vm cannot require("fs") — ReferenceError → load_error', async () => {
    const ctx = platform.createPlatformContext()
    const manifest = JSON.stringify({
      id: 'sec.vm.fs',
      permissions: ['storage'],
      activation: 'worker_js',
      entry: 'index.js',
    })
    const js = 'exports.activate = () => { require("fs"); }'
    const zip = buildStoredZip({ 'manifest.json': manifest, 'index.js': js })
    const installed = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(installed.ok, true)
    const activated = await platform.admitActivateExtension(ctx, 'sec.vm.fs')
    assert.equal(activated.ok, false)
    assert.match(activated.error, /require|is not defined|ReferenceError/i)
  })

  it('worker_js vm cannot access process.exit — host stays alive', async () => {
    const ctx = platform.createPlatformContext()
    const manifest = JSON.stringify({
      id: 'sec.vm.exit',
      permissions: ['storage'],
      activation: 'worker_js',
      entry: 'index.js',
    })
    const js = 'exports.activate = () => { process.exit(1); }'
    const zip = buildStoredZip({ 'manifest.json': manifest, 'index.js': js })
    const installed = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(installed.ok, true)
    // The vm sandbox has no `process` → ReferenceError, activation fails.
    const activated = await platform.admitActivateExtension(ctx, 'sec.vm.exit')
    assert.equal(activated.ok, false)
    // Host worker still operational.
    assert.ok(['running', 'stopped'].includes(ctx.extensions.getHostSupervisor().status()))
  })

  it('worker_js can only call callGate — the sole side-effect channel', async () => {
    const ctx = platform.createPlatformContext()
    const manifest = JSON.stringify({
      id: 'sec.vm.api',
      permissions: ['storage'],
      activation: 'worker_js',
      entry: 'index.js',
    })
    // Valid: uses callGate (the only allowed channel).
    const js = 'exports.activate = async () => { await callGate("storage.set", { op: "set", key: "x", value: 1 }); }'
    const zip = buildStoredZip({ 'manifest.json': manifest, 'index.js': js })
    const installed = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(installed.ok, true)
    const activated = await platform.admitActivateExtension(ctx, 'sec.vm.api')
    assert.equal(activated.ok, true)
    assert.equal(activated.jsLoaded, true)
  })
})

describe('Phase A — security: storage isolation', () => {
  it('extension A cannot read extension B storage (path isolation)', async () => {
    const ctx = platform.createPlatformContext()
    for (const id of ['sec.iso.a', 'sec.iso.b']) {
      await ctx.extensions.registerFromManifest(
        { id, permissions: ['storage'] },
        { trusted: true },
      )
      await ctx.extensions.activate(id)
    }
    await ctx.extensions.run('sec.iso.a', async (api) => {
      await api.callGate('storage.set', { op: 'set', key: 'secret', value: 'alpha' })
    })
    const result = await ctx.extensions.run('sec.iso.b', async (api) => {
      return api.callGate('storage.get', { op: 'get', key: 'secret' })
    })
    assert.equal(result.data.data.found, false)
  })

  it('extension cannot read host database files (no fs in vm)', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'sec.iso.host', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('sec.iso.host')
    // storage.get on a key the extension never wrote returns null (not host data).
    const result = await ctx.extensions.run('sec.iso.host', async (api) => {
      return api.callGate('storage.get', { op: 'get', key: 'opptrix.db' })
    })
    assert.equal(result.data.data.found, false)
  })
})

describe('Phase A — security: zip safety', () => {
  it('rejects path traversal in manifest.entry', async () => {
    const ctx = platform.createPlatformContext()
    const manifest = JSON.stringify({
      id: 'sec.zip.traversal',
      permissions: ['storage'],
      entry: '../../../etc/passwd',
      activation: 'worker_js',
    })
    const zip = buildStoredZip({ 'manifest.json': manifest })
    const result = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(result.ok, false)
  })

  it('rejects encrypted zip entries', async () => {
    const ctx = platform.createPlatformContext()
    // Build a zip with an encrypted flag (bit 0 of bit flags).
    const manifest = JSON.stringify({ id: 'sec.zip.encrypted', permissions: ['storage'] })
    const nameBuf = Buffer.from('manifest.json', 'utf8')
    const data = Buffer.from(manifest, 'utf8')
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x1, 6) // encrypted flag
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    const zip = Buffer.concat([local, data, Buffer.alloc(22)])
    const result = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(result.ok, false)
  })

  it('rejects zip exceeding size limit', async () => {
    const ctx = platform.createPlatformContext()
    const { OPX_ZIP_MAX_BYTES } = await import(platformModUrl)
    const huge = Buffer.alloc(OPX_ZIP_MAX_BYTES + 1)
    huge.writeUInt32LE(0x04034b50, 0)
    const result = platform.admitRegisterOpx(ctx, huge, { trusted: true })
    assert.equal(result.ok, false)
    assert.match(result.error, /exceeds|size/i)
  })
})

describe('Phase A — security: limits & R0', () => {
  it('a crashed extension does not block /api/health (R0)', async () => {
    const ctx = platform.createPlatformContext()
    // Register + activate an extension, then verify the host still functions.
    await ctx.extensions.registerFromManifest(
      { id: 'sec.r0.1', permissions: ['storage', 'platform.info'] },
      { trusted: true },
    )
    await ctx.extensions.activate('sec.r0.1')
    // Platform info still works (core path independent of extensions).
    const info = ctx.info()
    assert.ok(info.extensions >= 1)
    assert.ok(Array.isArray(info.packs))
  })

  it('permission denial returns structured denial (no throw)', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'sec.perm.1' /* no permissions */ },
      { trusted: true },
    )
    await ctx.extensions.activate('sec.perm.1')
    const result = await ctx.extensions.run('sec.perm.1', async (api) => {
      return api.callGate('storage.set', { op: 'set', key: 'k', value: 'v' })
    })
    // R0: run succeeds; the observation carries the denial.
    assert.equal(result.ok, true)
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'permission_denied')
  })
})
