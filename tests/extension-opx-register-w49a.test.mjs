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
const parseSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/parse-opx-manifest-from-zip.ts',
)
const admitSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/admit-register-opx.ts',
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

describe('opx zip register (Wave 49A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('valid zip → registered inactive via parse + admitRegisterOpx', () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-opx-w49',
        name: 'Opx Demo',
        version: '1.2.3',
        capabilities: ['quotes'],
      }),
      'dist/host/index.js': 'console.log("never loaded")',
    })

    const parsed = platform.parseOpxManifestFromZip(zip)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) throw new Error('expected parse ok')
    assert.equal(parsed.manifest.id, 'ext-opx-w49')

    const ctx = platform.createPlatformContext()
    const result = platform.admitRegisterOpx(ctx, zip, {
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.extension.id, 'ext-opx-w49')
    assert.equal(result.extension.state, 'inactive')
    assert.equal(result.extension.name, 'Opx Demo')
    assert.equal(result.extension.version, '1.2.3')
    assert.deepEqual(result.extension.capabilities, ['quotes'])
    assert.equal(result.extensionsActive, 0)
    assert.equal(ctx.extensions.list().length, 1)
  })

  it('opx.manifest.json at root accepted', () => {
    const zip = buildStoredZip({
      'opx.manifest.json': JSON.stringify({ id: 'ext-alt-name' }),
    })
    const parsed = platform.parseOpxManifestFromZip(zip)
    assert.equal(parsed.ok, true)
    if (!parsed.ok) throw new Error('expected ok')
    assert.equal(parsed.manifest.id, 'ext-alt-name')
  })

  it('bad zip / missing manifest fails', () => {
    assert.equal(platform.parseOpxManifestFromZip(Buffer.from('not-a-zip')).ok, false)
    assert.equal(platform.parseOpxManifestFromZip(Buffer.alloc(0)).ok, false)

    const noManifest = buildStoredZip({
      'readme.txt': 'hi',
      'nested/manifest.json': JSON.stringify({ id: 'nested' }),
    })
    const miss = platform.parseOpxManifestFromZip(noManifest)
    assert.equal(miss.ok, false)
    if (miss.ok) throw new Error('expected fail')
    assert.match(miss.error, /manifest\.json|opx\.manifest/)

    const noId = buildStoredZip({
      'manifest.json': JSON.stringify({ name: 'no-id' }),
    })
    const badId = platform.parseOpxManifestFromZip(noId)
    assert.equal(badId.ok, false)
  })

  it('path traversal entries rejected', () => {
    const zip = buildStoredZip({
      '../evil.json': JSON.stringify({ id: 'evil' }),
      'manifest.json': JSON.stringify({ id: 'ok' }),
    })
    const parsed = platform.parseOpxManifestFromZip(zip)
    assert.equal(parsed.ok, false)
    if (parsed.ok) throw new Error('expected fail')
    assert.match(parsed.error, /path traversal/i)
  })

  it('manifest entry/main: registerFromManifest rejects; opx strips path keys (no host eval)', () => {
    const ctx = platform.createPlatformContext()
    const direct = ctx.extensions.registerFromManifest({
      id: 'ext-with-entry-direct',
      entry: './dist/host/index.js',
      main: 'index.js',
    })
    assert.equal(direct.ok, false)
    if (direct.ok) throw new Error('expected fail')
    assert.match(direct.error, /file path|entry|main/i)

    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({
        id: 'ext-with-entry',
        entry: './dist/host/index.js',
        main: 'index.js',
      }),
    })
    const result = platform.admitRegisterOpx(ctx, zip)
    assert.equal(result.ok, true, result.ok ? '' : result.error)
    if (!result.ok) throw new Error('expected ok after strip')
    assert.equal(result.extension.id, 'ext-with-entry')
    assert.equal(result.extension.state, 'inactive')
    assert.equal(ctx.extensions.list().length, 1)
  })

  it('source has no eval/require/import of extension code', () => {
    const parseText = fs.readFileSync(parseSrc, 'utf8')
    const admitText = fs.readFileSync(admitSrc, 'utf8')
    for (const src of [parseText, admitText]) {
      assert.doesNotMatch(src, /\beval\s*\(/)
      assert.doesNotMatch(src, /new\s+Function\s*\(/)
      assert.doesNotMatch(src, /\bimport\s*\(/)
      assert.doesNotMatch(src, /\brequire\s*\(/)
      assert.doesNotMatch(src, /\breadFile(?:Sync)?\s*\(/)
      assert.doesNotMatch(src, /\bwriteFile(?:Sync)?\s*\(/)
    }
  })

  it('C-OPX-REGISTER + ABI 0.8.43-w58', () => {
    const zip = buildStoredZip({
      'manifest.json': JSON.stringify({ id: 'c-opx-register' }),
    })
    const ctx = platform.createPlatformContext()
    const result = platform.admitRegisterOpx(ctx, zip)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.extension.id, 'c-opx-register')
    assert.equal(result.extension.state, 'inactive')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
    assert.ok(platform.OPX_ZIP_MAX_BYTES <= 2 * 1024 * 1024)
    assert.ok(platform.OPX_MANIFEST_MAX_BYTES <= 64 * 1024)
  })
})
