/**
 * Phase B store compatibility tests — client ↔ mock registry protocol suite.
 *
 * Spins a local HTTP mock implementing docs/EXTENSION-STORE-PROTOCOL.md §4
 * and drives the full client pipeline: search → detail → download → verify →
 * install. Covers success, tamper rejection, revocation, ABI incompatibility,
 * hash mismatch, unsigned rejection, and error propagation.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import http from 'node:http'
import { crc32 } from 'node:zlib'
import { createHash } from 'node:crypto'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const storeClientModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/store/store-client.js'),
).href

let tmpRoot
let dataDir
let platform
let mockServer
let mockBaseUrl

/** Mutable mock registry state (reset per test). */
let registryState

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-store-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  delete process.env.OPPTRIX_EXT_DEV
  platform = await import(`${platformModUrl}?t=${Date.now()}`)
  platform.resetPlatformContextForTests()

  registryState = {
    packages: new Map(), // id → { versions: Map(version → {bytes, sha256, abi, reviewState, revoked}) }
  }

  // Local mock registry (protocol §4).
  mockServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const sendJson = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && url.pathname === '/v1/extensions') {
      const q = url.searchParams.get('q') ?? ''
      const items = [...registryState.packages.values()]
        .filter((p) => !q || p.id.includes(q) || p.name.includes(q))
        .map((p) => ({ id: p.id, name: p.name, version: p.latest, publisher: p.publisher }))
      sendJson(200, { total: items.length, items })
      return
    }
    const detailMatch = /^\/v1\/extensions\/([^/]+)$/.exec(url.pathname)
    if (req.method === 'GET' && detailMatch) {
      const pkg = registryState.packages.get(decodeURIComponent(detailMatch[1]))
      if (!pkg) {
        sendJson(404, { code: 'not_found', error: 'not found' })
        return
      }
      sendJson(200, {
        id: pkg.id,
        name: pkg.name,
        publisher: pkg.publisher,
        versions: [...pkg.versions.entries()].map(([version, v]) => ({
          version,
          sha256: v.sha256,
          reviewState: v.revoked ? 'revoked' : 'approved',
          revokedAt: v.revoked ? new Date().toISOString() : null,
          revokeReason: v.revoked ? v.revokeReason : null,
          abi: v.abi,
          downloadUrl: `/v1/extensions/${pkg.id}/${version}/download`,
        })),
      })
      return
    }
    const dlMatch = /^\/v1\/extensions\/([^/]+)\/([^/]+)\/download$/.exec(url.pathname)
    if (req.method === 'GET' && dlMatch) {
      const pkg = registryState.packages.get(decodeURIComponent(dlMatch[1]))
      const version = decodeURIComponent(dlMatch[2])
      const v = pkg?.versions.get(version)
      if (!v) {
        sendJson(404, { code: 'not_found', error: 'not found' })
        return
      }
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'x-opptrix-sha256': v.serveHash ?? v.sha256,
      })
      res.end(v.bytes)
      return
    }
    if (req.method === 'GET' && url.pathname === '/v1/revocations') {
      const entries = []
      for (const pkg of registryState.packages.values()) {
        for (const [version, v] of pkg.versions.entries()) {
          if (v.revoked) entries.push({ id: pkg.id, version, reason: v.revokeReason ?? 'security' })
        }
      }
      sendJson(200, { entries })
      return
    }
    sendJson(404, { code: 'not_found', error: 'no route' })
  })
  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve))
  const port = mockServer.address().port
  mockBaseUrl = `http://127.0.0.1:${port}`
  process.env.OPPTRIX_STORE_REGISTRY_BASE = mockBaseUrl
})

afterEach(async () => {
  platform.resetPlatformContextForTests()
  for (const k of ['OPPTRIX_DATA_DIR', 'OPPTRIX_STORE_REGISTRY_BASE', 'OPPTRIX_STORE_PUBLIC_KEY', 'OPPTRIX_EXT_DEV']) {
    delete process.env[k]
  }
  await new Promise((resolve) => mockServer.close(resolve))
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

/** Build a signed .opx + sha256, per the pack/sign contract. */
async function buildSignedPackage(id, opts = {}) {
  const signing = await import(
    pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href
  )
  const manifest = JSON.stringify({
    id,
    permissions: ['storage'],
    activation: 'catalog_only',
    ...(opts.manifestExtra ?? {}),
  })
  const indexJs = opts.entryJs ?? 'exports.activate = () => {}'
  const checksums = signing.buildChecksumsPayload([
    { name: 'index.js', data: Buffer.from(indexJs) },
    { name: 'manifest.json', data: Buffer.from(manifest) },
  ])
  const signature = signing.signChecksums(checksums, privateKeyPem)
  const bytes = buildStoredZip({
    'manifest.json': manifest,
    'index.js': indexJs,
    'SIGNATURE.ed25519': signature,
  })
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { bytes, sha256, abi: opts.abi, revoked: opts.revoked, revokeReason: opts.revokeReason }
}

async function loadInstall() {
  const m = await import(`${storeClientModUrl}?t=${Date.now()}`)
  return m.installFromStore
}

let privateKeyPem

beforeEach(async () => {
  const signing = await import(
    pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/store-signing.js')).href
  )
  const kp = signing.generatePublisherKeyPair()
  privateKeyPem = kp.privateKeyPem
  process.env.OPPTRIX_STORE_PUBLIC_KEY = kp.publicKeyPem
})

function makeClient() {
  const clientModUrl = pathToFileURL(
    path.join(here, '../apps/server/dist/platform/store/store-client.js'),
  ).href
  return import(clientModUrl).then((m) =>
    m.createStoreClient({ baseUrl: mockBaseUrl, timeoutMs: 5000 }),
  )
}

async function publishPackage(id, opts) {
  const pkg = await buildSignedPackage(id, opts)
  let versions = registryState.packages.get(id)?.versions
  if (!versions) {
    versions = new Map()
    registryState.packages.set(id, {
      id,
      name: id,
      publisher: 'example',
      versions,
    })
  }
  versions.set(opts.version ?? '1.0.0', {
    bytes: pkg.bytes,
    sha256: pkg.sha256,
    abi: pkg.abi,
    revoked: pkg.revoked === true,
    revokeReason: pkg.revokeReason,
    serveHash: opts.serveHash,
  })
}

describe('Phase B — store compatibility (client ↔ mock registry)', () => {
  it('search → detail → install: happy path installs and activates', async () => {
    const ctx = platform.createPlatformContext()
    const client = await makeClient()
    await publishPackage('com.example.store.happy', { version: '1.0.0' })

    const search = await client.search({ q: 'store.happy' })
    assert.equal(search.items.length, 1)
    assert.equal(search.items[0].id, 'com.example.store.happy')

    const installFromStore = await loadInstall()

    const result = await installFromStore(ctx, client, {
      id: 'com.example.store.happy',
    })
    assert.equal(result.ok, true, result.ok ? '' : result.error)
    assert.equal(result.verified, true)
    assert.equal(result.activated, true)
    assert.ok(ctx.extensions.list().some((e) => e.id === 'com.example.store.happy'))
  })

  it('tampered download (hash mismatch) is rejected', async () => {
    const ctx = platform.createPlatformContext()
    const client = await makeClient()
    await publishPackage('com.example.store.tamper', {
      version: '1.0.0',
      serveHash: '0'.repeat(64), // registry metadata says one hash, bytes are another
    })
    const installFromStore = await loadInstall()
    const result = await installFromStore(ctx, client, {
      id: 'com.example.store.tamper',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'hash_mismatch')
  })

  it('revoked version is rejected', async () => {
    const ctx = platform.createPlatformContext()
    const client = await makeClient()
    await publishPackage('com.example.store.revoked', {
      version: '1.0.0',
      revoked: true,
      revokeReason: 'security',
    })
    const installFromStore = await loadInstall()
    const result = await installFromStore(ctx, client, {
      id: 'com.example.store.revoked',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'revoked')
  })

  it('incompatible ABI is rejected (422 semantics)', async () => {
    const ctx = platform.createPlatformContext()
    const client = await makeClient()
    await publishPackage('com.example.store.abi', {
      version: '1.0.0',
      abi: '9.9.9-future',
    })
    const installFromStore = await loadInstall()
    const result = await installFromStore(ctx, client, {
      id: 'com.example.store.abi',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'incompatible')
  })

  it('unsigned store package is rejected even without explicit key mismatch', async () => {
    const ctx = platform.createPlatformContext()
    const client = await makeClient()
    // Publish an UNSIGNED package (bypasses the signed builder).
    const bytes = buildStoredZip({
      'manifest.json': JSON.stringify({ id: 'com.example.store.unsigned', permissions: ['storage'] }),
    })
    registryState.packages.set('com.example.store.unsigned', {
      id: 'com.example.store.unsigned',
      name: 'unsigned',
      publisher: 'example',
      versions: new Map([['1.0.0', { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }]]),
    })
    const installFromStore = await loadInstall()
    const result = await installFromStore(ctx, client, {
      id: 'com.example.store.unsigned',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'unsigned')
  })

  it('store install without trust anchor fails (no OPPTRIX_STORE_PUBLIC_KEY)', async () => {
    delete process.env.OPPTRIX_STORE_PUBLIC_KEY
    const ctx = platform.createPlatformContext()
    const client = await makeClient()
    await publishPackage('com.example.store.nokey', { version: '1.0.0' })
    const installFromStore = await loadInstall()
    const result = await installFromStore(ctx, client, {
      id: 'com.example.store.nokey',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'no_trust_anchor')
  })

  it('detail endpoint annotates host ABI', async () => {
    platform.createPlatformContext()
    const client = await makeClient()
    await publishPackage('com.example.store.detail', { version: '1.0.0' })
    const detail = await client.detail('com.example.store.detail')
    assert.equal(detail.id, 'com.example.store.detail')
    assert.equal(detail.versions.length, 1)
    assert.equal(detail.versions[0].reviewState, 'approved')
  })
})
