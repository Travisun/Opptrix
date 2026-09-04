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
const admitActivateSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/admit-activate-extension.ts',
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

describe('opx sandboxed activate (Wave 55A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
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

  it('worker_stub register → activate → hostBound true + hostWorker running', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().hostWorker, 'stopped')

    const reg = ctx.extensions.registerFromManifest({
      id: 'ext-w55-stub',
      name: 'Stub Ext',
      version: '1.0.0',
      activation: 'worker_stub',
    })
    assert.equal(reg.ok, true)
    const listed = ctx.extensions.list().find((r) => r.id === 'ext-w55-stub')
    assert.equal(listed?.activation, 'worker_stub')
    assert.equal(listed?.hostBound, undefined)
    assert.equal(listed?.state, 'inactive')

    const act = await platform.admitActivateExtension(ctx, 'ext-w55-stub', {
      origin: 'cli.diagnostic',
    })
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected activate ok')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.extension.activation, 'worker_stub')
    assert.equal(act.extension.hostBound, true)
    assert.equal(act.activation, 'worker_stub')
    assert.equal(act.hostBound, true)
    assert.equal(act.extensionsActive, 1)
    assert.equal(ctx.info().hostWorker, 'running')
    assert.equal(ctx.extensions.getHostSupervisor().status(), 'running')
  })

  it('catalog_only (default) activate is state flip only — no hostBound / no worker start', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().hostWorker, 'stopped')

    assert.equal(
      ctx.extensions.registerFromManifest({
        id: 'ext-w55-catalog',
        activation: 'catalog_only',
      }).ok,
      true,
    )
    const act = await platform.admitActivateExtension(ctx, 'ext-w55-catalog')
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected ok')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.extension.activation, 'catalog_only')
    assert.equal(act.extension.hostBound, undefined)
    assert.equal(act.hostBound, undefined)
    assert.equal(ctx.info().hostWorker, 'stopped')
    assert.equal(ctx.extensions.getHostSupervisor().status(), 'stopped')
  })

  it('omitted activation defaults to catalog_only behavior', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.extensions.registerFromManifest({ id: 'ext-w55-default' }).ok, true)
    const act = await platform.admitActivateExtension(ctx, 'ext-w55-default')
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected ok')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.extension.hostBound, undefined)
    assert.equal(ctx.info().hostWorker, 'stopped')
  })

  it('path entry/main: registerFromManifest rejects; opx strips (no host eval)', () => {
    const ctx = platform.createPlatformContext()
    const withEntry = ctx.extensions.registerFromManifest({
      id: 'ext-w55-entry',
      entry: './dist/host/index.js',
      activation: 'worker_stub',
    })
    assert.equal(withEntry.ok, false)
    if (withEntry.ok) throw new Error('expected fail')
    assert.match(withEntry.error, /file path|entry/i)
    assert.equal(ctx.extensions.list().length, 0)

    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-w55-opx-entry',
        main: 'index.js',
        activation: 'worker_stub',
      }),
      'index.js': 'throw new Error("never")',
    })
    const opx = platform.admitRegisterOpx(ctx, zip)
    assert.equal(opx.ok, true, opx.ok ? '' : opx.error)
    if (!opx.ok) throw new Error('expected ok after strip')
    assert.equal(opx.extension.activation, 'worker_stub')
    assert.equal(opx.extension.state, 'inactive')
  })

  it('invalid activation rejected', () => {
    const ctx = platform.createPlatformContext()
    const bad = ctx.extensions.registerFromManifest({
      id: 'ext-w55-bad-act',
      activation: 'eval_js',
    })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.match(bad.error, /activation/)
  })

  it('opx zip with worker_stub → register → activate binds host', async () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-opx-w55',
        name: 'Opx Stub',
        activation: 'worker_stub',
      }),
      'dist/host/index.js': 'console.log("never loaded")',
    })
    const ctx = platform.createPlatformContext()
    const reg = platform.admitRegisterOpx(ctx, zip)
    assert.equal(reg.ok, true)
    if (!reg.ok) throw new Error('expected register ok')
    assert.equal(reg.extension.state, 'inactive')
    assert.equal(reg.extension.activation, 'worker_stub')

    const act = await platform.admitActivateExtension(ctx, 'ext-opx-w55')
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected activate ok')
    assert.equal(act.hostBound, true)
    assert.equal(ctx.info().hostWorker, 'running')
  })

  it('activate path has no eval/import/require of package JS', () => {
    const mgr = fs.readFileSync(createMgrSrc, 'utf8')
    const admit = fs.readFileSync(admitActivateSrc, 'utf8')
    for (const src of [mgr, admit]) {
      assert.doesNotMatch(src, /\beval\s*\(/)
      assert.doesNotMatch(src, /new\s+Function\s*\(/)
    }
    const activateStart = mgr.indexOf('async activate')
    const deactivateStart = mgr.indexOf('async deactivate')
    const activateSlice = mgr.slice(
      activateStart,
      deactivateStart > activateStart ? deactivateStart : activateStart + 2500,
    )
    assert.doesNotMatch(activateSlice, /\bimport\s*\(/)
    assert.doesNotMatch(activateSlice, /\brequire\s*\(/)
    assert.doesNotMatch(activateSlice, /\breadFile(?:Sync)?\s*\(/)
    assert.match(activateSlice, /worker_stub/)
    assert.match(activateSlice, /hostBound/)
  })

  it('C-OPX-ACTIVATE + ABI 0.8.43-w58', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(
      ctx.extensions.registerFromManifest({
        id: 'c-opx-activate',
        activation: 'worker_stub',
      }).ok,
      true,
    )
    const act = await platform.admitActivateExtension(ctx, 'c-opx-activate')
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected ok')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.hostBound, true)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
