import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { crc32 } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const createMgrSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/create-extension-manager.ts',
)
const hostRpcSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/host-worker-rpc.ts',
)
const parseSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/parse-opx-manifest-from-zip.ts',
)

/**
 * Minimal store-only (method 0) zip writer for tests — no third-party deps.
 * @param {Record<string, string | Uint8Array>} files
 */
function buildStoredZip(files) {
  /** @type {Buffer[]} */
  const localParts = []
  /** @type {Buffer[]} */
  const cdParts = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
    const crc = crc32(data) >>> 0

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8) // stored
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

describe('opx worker_js load in host worker vm (Wave 58A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(`${platformModUrl}?t=${Date.now()}`)
    platform.resetPlatformContextForTests()
  })

  afterEach(async () => {
    try {
      const ctx = platform.getPlatformContext()
      await ctx.extensions.host.stop()
    } catch {
      // no shared ctx / already stopped
    }
    platform.resetPlatformContextForTests()
  })

  it('safe index.js callGate → activate worker_js → gate invoked', async () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-w58-gate',
        name: 'Gate Ext',
        activation: 'worker_js',
      }),
      'index.js': `
module.exports = {
  async activate() {
    await callGate('get_quotes', { code: '600519', from: extensionId })
  }
}
`,
    })

    const ctx = platform.createPlatformContext()
    const before = ctx.meter.snapshot().submitCount
    const reg = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(reg.ok, true, reg.ok ? '' : reg.error)
    if (!reg.ok) throw new Error('expected register ok')
    assert.equal(reg.extension.activation, 'worker_js')
    assert.equal(reg.entryPath, 'index.js')
    assert.equal(ctx.info().hostWorker, 'stopped')

    const act = await platform.admitActivateExtension(ctx, 'ext-w58-gate')
    assert.equal(act.ok, true, act.ok ? '' : act.error)
    if (!act.ok) throw new Error('expected activate ok')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.hostBound, true)
    assert.equal(act.jsLoaded, true)
    assert.equal(act.experimental, true)
    assert.equal(act.extension.jsLoaded, true)
    assert.equal(ctx.info().hostWorker, 'running')
    assert.ok(
      ctx.meter.snapshot().submitCount >= before + 1,
      'expected callGate from extension to submit via gate',
    )
  })

  it('malicious require("fs") fails in vm — load_error, not active', async () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-w58-evil',
        activation: 'worker_js',
      }),
      'index.js': `require('fs'); module.exports = { activate() {} }`,
    })
    const ctx = platform.createPlatformContext()
    const reg = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(reg.ok, true, reg.ok ? '' : reg.error)
    if (!reg.ok) throw new Error('expected register ok')

    const act = await platform.admitActivateExtension(ctx, 'ext-w58-evil')
    assert.equal(act.ok, false)
    if (act.ok) throw new Error('expected activate fail')
    assert.match(act.error, /require|is not defined|ReferenceError/i)
    const listed = ctx.extensions.list().find((r) => r.id === 'ext-w58-evil')
    assert.equal(listed?.state, 'inactive')
    assert.equal(listed?.jsLoaded, undefined)
  })

  it('path traversal entry rejected at parse', () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-w58-trav',
        activation: 'worker_js',
        entry: '../evil.js',
      }),
      'evil.js': 'module.exports = {}',
    })
    const parsed = platform.parseOpxManifestFromZip(zip)
    assert.equal(parsed.ok, false)
    if (parsed.ok) throw new Error('expected fail')
    assert.match(parsed.error, /entry path rejected|path traversal|\.\./i)

    const unsafe = platform.normalizeSafeEntryPath('../etc/passwd')
    assert.equal(unsafe, null)
    assert.equal(platform.normalizeSafeEntryPath('dist/host/index.js'), 'dist/host/index.js')
  })

  it('manifest.entry path-safe loads when defaults absent', async () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-w58-entry',
        activation: 'worker_js',
        entry: './lib/run.js',
      }),
      'lib/run.js': `
module.exports = {
  async activate() {
    await callGate('ping_ext', { ok: true })
  }
}
`,
    })
    const ctx = platform.createPlatformContext()
    const reg = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(reg.ok, true, reg.ok ? '' : reg.error)
    if (!reg.ok) throw new Error('expected ok')
    assert.equal(reg.entryPath, 'lib/run.js')

    const before = ctx.meter.snapshot().submitCount
    const act = await platform.admitActivateExtension(ctx, 'ext-w58-entry')
    assert.equal(act.ok, true, act.ok ? '' : act.error)
    if (!act.ok) throw new Error('expected activate ok')
    assert.equal(act.jsLoaded, true)
    assert.ok(ctx.meter.snapshot().submitCount >= before + 1)
  })

  it('registerFromManifest still rejects entry path fields (no zip)', () => {
    const ctx = platform.createPlatformContext()
    const bad = ctx.extensions.registerFromManifest({
      id: 'ext-w58-json-entry',
      activation: 'worker_js',
      entry: 'index.js',
    }, { trusted: true })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.match(bad.error, /file path|entry/i)
  })

  it('main/server process never evals/requires extension source', () => {
    const mgr = fs.readFileSync(createMgrSrc, 'utf8')
    const parse = fs.readFileSync(parseSrc, 'utf8')
    const activateStart = mgr.indexOf('async activate')
    const deactivateStart = mgr.indexOf('async deactivate')
    const activateSlice = mgr.slice(
      activateStart,
      deactivateStart > activateStart ? deactivateStart : activateStart + 3500,
    )
    assert.doesNotMatch(activateSlice, /\beval\s*\(/)
    assert.doesNotMatch(activateSlice, /new\s+Function\s*\(/)
    assert.doesNotMatch(activateSlice, /\brequire\s*\(/)
    assert.doesNotMatch(activateSlice, /runInContext|runInNewContext|runInThisContext/)
    assert.match(activateSlice, /loadExtension/)
    assert.match(activateSlice, /worker_js/)
    assert.doesNotMatch(parse, /\beval\s*\(/)
    assert.doesNotMatch(parse, /\brequire\s*\(/)

    const rpc = fs.readFileSync(hostRpcSrc, 'utf8')
    assert.match(rpc, /load_extension/)
    assert.match(rpc, /load_ok/)
    assert.match(rpc, /load_error/)
    assert.match(rpc, /runInContext/)
    assert.match(rpc, /node:vm|from 'node:vm'|from "node:vm"/)
  })

  it('C-OPX-WORKER-JS + ABI 0.8.52-thin-a', async () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'c-opx-w58',
        activation: 'worker_js',
      }),
      'dist/host/index.js': 'module.exports = { activate() { return callGate("c58") } }',
    })
    const ctx = platform.createPlatformContext()
    const reg = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(reg.ok, true)
    if (!reg.ok) throw new Error('expected ok')
    assert.equal(reg.entryPath, 'dist/host/index.js')
    const act = await platform.admitActivateExtension(ctx, 'c-opx-w58')
    assert.equal(act.ok, true, act.ok ? '' : act.error)
    if (!act.ok) throw new Error('expected ok')
    assert.equal(act.jsLoaded, true)
    assert.equal(act.experimental, true)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
    assert.ok(platform.OPX_ENTRY_SOURCE_MAX_BYTES <= 256 * 1024)
  })
})
