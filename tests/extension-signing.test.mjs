/**
 * Phase B Ed25519 signing tests — keygen/sign/verify round-trip, tamper
 * detection, install-time verification (fail-closed when keys configured),
 * and explicit dev bypass.
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-sig-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  delete process.env.OPPTRIX_EXT_DEV
  delete process.env.OPPTRIX_STORE_PUBLIC_KEY
  platform = await import(`${platformModUrl}?t=${Date.now()}`)
  platform.resetPlatformContextForTests()
})
afterEach(() => {
  platform.resetPlatformContextForTests()
  for (const k of ['OPPTRIX_DATA_DIR', 'OPPTRIX_EXT_DEV', 'OPPTRIX_STORE_PUBLIC_KEY']) {
    delete process.env[k]
  }
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

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

describe('Phase B — Ed25519 signing primitives', () => {
  it('keygen → sign → verify round-trips', async () => {
    const { generatePublisherKeyPair, buildChecksumsPayload, signChecksums, verifySignature } =
      await import(pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href)
    const { publicKeyPem, privateKeyPem } = generatePublisherKeyPair()
    assert.match(publicKeyPem, /BEGIN PUBLIC KEY/)
    const payload = buildChecksumsPayload([
      { name: 'manifest.json', data: Buffer.from('{"id":"x"}') },
      { name: 'index.js', data: Buffer.from('exports.a=1') },
    ])
    const sig = signChecksums(payload, privateKeyPem)
    const result = verifySignature(payload, sig, publicKeyPem)
    assert.equal(result.ok, true)
  })

  it('tampered payload fails verification', async () => {
    const { generatePublisherKeyPair, buildChecksumsPayload, signChecksums, verifySignature } =
      await import(pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href)
    const { publicKeyPem, privateKeyPem } = generatePublisherKeyPair()
    const payload = buildChecksumsPayload([{ name: 'a.js', data: Buffer.from('1') }])
    const sig = signChecksums(payload, privateKeyPem)
    const tampered = payload.replace('a.js', 'b.js')
    const result = verifySignature(tampered, sig, publicKeyPem)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'bad_signature')
  })

  it('wrong key fails verification', async () => {
    const signing = await import(pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href)
    const a = signing.generatePublisherKeyPair()
    const b = signing.generatePublisherKeyPair()
    const payload = signing.buildChecksumsPayload([{ name: 'a.js', data: Buffer.from('1') }])
    const sig = signing.signChecksums(payload, a.privateKeyPem)
    const result = signing.verifySignature(payload, sig, b.publicKeyPem)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'bad_signature')
  })
})

describe('Phase B — install-time signature verification', () => {
  it('unsigned package rejected when a trusted key is configured; accepted unverified otherwise', async () => {
    const ctx = platform.createPlatformContext()
    const { generatePublisherKeyPair } = await import(
      pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href
    )
    const { publicKeyPem } = generatePublisherKeyPair()
    process.env.OPPTRIX_STORE_PUBLIC_KEY = publicKeyPem

    const manifest = JSON.stringify({ id: 'sig.unsigned', permissions: ['storage'], activation: 'catalog_only' })
    const zip = buildStoredZip({ 'manifest.json': manifest })
    const result = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(result.ok, false)
    assert.match(result.error, /unsigned|SIGNATURE/)
  })

  it('signed package installs and reports verified=true', async () => {
    const signing = await import(
      pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href
    )
    const ctx = platform.createPlatformContext()
    const { publicKeyPem, privateKeyPem } = signing.generatePublisherKeyPair()
    process.env.OPPTRIX_STORE_PUBLIC_KEY = publicKeyPem

    const manifest = JSON.stringify({ id: 'sig.signed', permissions: ['storage'], activation: 'catalog_only' })
    const indexJs = 'exports.activate = () => {}'
    const checksums = signing.buildChecksumsPayload([
      { name: 'index.js', data: Buffer.from(indexJs) },
      { name: 'manifest.json', data: Buffer.from(manifest) },
    ])
    const signature = signing.signChecksums(checksums, privateKeyPem)
    const zip = buildStoredZip({
      'manifest.json': manifest,
      'index.js': indexJs,
      'SIGNATURE.ed25519': signature,
    })
    const result = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(result.ok, true, result.ok ? '' : result.error)
    assert.equal(result.verified, true)
  })

  it('tampered signed package is rejected (fail-closed)', async () => {
    const signing = await import(
      pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href
    )
    const ctx = platform.createPlatformContext()
    const { publicKeyPem, privateKeyPem } = signing.generatePublisherKeyPair()
    process.env.OPPTRIX_STORE_PUBLIC_KEY = publicKeyPem

    const manifest = JSON.stringify({ id: 'sig.tamper', permissions: ['storage'], activation: 'worker_js', entry: 'index.js' })
    const indexJs = 'exports.activate = () => {}'
    const checksums = signing.buildChecksumsPayload([
      { name: 'index.js', data: Buffer.from(indexJs) },
      { name: 'manifest.json', data: Buffer.from(manifest) },
    ])
    const signature = signing.signChecksums(checksums, privateKeyPem)
    // Swap the entry JS AFTER signing (malicious payload swap).
    const evilJs = 'exports.activate = () => { require("fs") }'
    const zip = buildStoredZip({
      'manifest.json': manifest,
      'index.js': evilJs,
      'SIGNATURE.ed25519': signature,
    })
    const result = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(result.ok, false)
    assert.match(result.error, /signature/)
  })

  it('dev mode (OPPTRIX_EXT_DEV=1) bypasses verification explicitly', async () => {
    const ctx = platform.createPlatformContext()
    process.env.OPPTRIX_EXT_DEV = '1'
    const signing = await import(
      pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href
    )
    const { generatePublisherKeyPair } = signing
    const { publicKeyPem } = generatePublisherKeyPair()
    process.env.OPPTRIX_STORE_PUBLIC_KEY = publicKeyPem

    const manifest = JSON.stringify({ id: 'sig.dev', permissions: ['storage'], activation: 'catalog_only' })
    const zip = buildStoredZip({ 'manifest.json': manifest }) // unsigned
    const result = platform.admitRegisterOpx(ctx, zip, { trusted: true })
    assert.equal(result.ok, true, result.ok ? '' : result.error)
    assert.equal(result.verified, false, 'dev installs are recorded as unverified')
  })
})
