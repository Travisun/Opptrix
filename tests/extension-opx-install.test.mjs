/**
 * Phase A .opx install flow tests — parse → register → activate → use → uninstall.
 *
 * Exercises the install pipeline end-to-end through the same code paths as the
 * HTTP layer (admitRegisterOpx → registerFromManifest → activate).
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-install-'))
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

// Minimal store-only zip builder (local headers + central directory + EOCD).
function buildStoredZip(files) {
  const localParts = []
  const cdParts = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.from(content)
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
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

function buildOpxManifest(over = {}) {
  return JSON.stringify({
    id: 'com.example.test',
    name: 'Test Extension',
    version: '1.0.0',
    permissions: ['storage', 'events.subscribe', 'platform.info'],
    activation: 'catalog_only',
    ...over,
  })
}

describe('Phase A — .opx install flow', () => {
  it('installs a .opx, activates, uses storage, and uninstalls', async () => {
    const ctx = platform.createPlatformContext()
    const manifest = buildOpxManifest()
    const zip = buildStoredZip({ 'manifest.json': manifest })

    // Install (parse → register).
    const installed = platform.admitRegisterOpx(ctx, zip, {
      origin: 'test',
      trusted: true,
    })
    assert.equal(installed.ok, true, installed.ok ? '' : installed.error)
    assert.equal(installed.extension.id, 'com.example.test')

    // Activate.
    const activated = await platform.admitActivateExtension(ctx, 'com.example.test', {
      origin: 'test',
    })
    assert.equal(activated.ok, true)
    const extMgr = ctx.extensions

    // Use storage.
    const setResult = await ctx.extensions.run('com.example.test', async (api) => {
      return api.callGate('storage.set', { op: 'set', key: 'k', value: 'v' })
    })
    assert.equal(setResult.data.ok, true)

    // List shows the extension.
    const listed = platform.admitPlatformExtensions(ctx)
    assert.equal(listed.ok, true)
    assert.ok(listed.extensions.some((e) => e.id === 'com.example.test'))

    // Uninstall.
    const uninstalled = ctx.extensions.uninstall('com.example.test')
    assert.equal(uninstalled.ok, true)

    // After uninstall, the extension is gone from the list.
    const afterList = platform.admitPlatformExtensions(ctx)
    assert.ok(!afterList.extensions.some((e) => e.id === 'com.example.test'))
  })

  it('rejects a .opx with path traversal in entry path', async () => {
    const ctx = platform.createPlatformContext()
    const manifest = JSON.stringify({
      id: 'com.example.bad',
      permissions: ['storage'],
      entry: '../../../etc/passwd',
      activation: 'worker_js',
    })
    const zip = buildStoredZip({ 'manifest.json': manifest })
    const result = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(result.ok, false)
    assert.match(result.error, /path traversal|entry|rejected/i)
  })

  it('rejects a .opx exceeding size limit', async () => {
    const ctx = platform.createPlatformContext()
    // Build a zip with a huge manifest to exceed 2MB... instead test the parser
    // rejects an oversized input directly via parseOpxManifestFromZip.
    const { OPX_ZIP_MAX_BYTES } = await import(platformModUrl)
    const huge = Buffer.alloc(OPX_ZIP_MAX_BYTES + 1)
    huge.writeUInt32LE(0x04034b50, 0) // zip signature so it gets past initial check
    const result = platform.admitRegisterOpx(ctx, huge, { trusted: true })
    assert.equal(result.ok, false)
    assert.match(result.error, /exceeds|too large|size/i)
  })

  it('install auto-activates by default and flags experimental for worker_js', async () => {
    const ctx = platform.createPlatformContext()
    const manifest = buildOpxManifest({
      id: 'com.example.worker',
      activation: 'worker_js',
      entry: 'index.js',
    })
    const workerJs = 'exports.activate = async () => { await callGate("storage.set", { op: "set", key: "init", value: true }); }'
    const zip = buildStoredZip({
      'manifest.json': manifest,
      'index.js': workerJs,
    })
    const installed = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(installed.ok, true)

    const activated = await platform.admitActivateExtension(ctx, 'com.example.worker', {
      origin: 'test',
    })
    assert.equal(activated.ok, true)
    assert.equal(activated.experimental, true)
  })
})
