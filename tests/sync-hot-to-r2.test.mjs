import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  HOT_CHECK_UPDATE_KEY,
  HOT_PACKAGES_PREFIX,
  RUNTIME_LINUX_ARCH_KEYS,
  buildCheckUpdatePayload,
  collectHotRuntimeFiles,
  contentTypeForHotObjectKey,
  hotCheckUpdateUrl,
  hotPackageObjectKey,
  hotPackageUrls,
  hotPurgeUrls,
  HOT_RELEASES_KEY,
  hotReleasesUrl,
  mergeReleaseHistory,
  hotSha256ObjectKey,
  normalizeCdnBase,
  normalizeHotVersion,
  runtimeArchBinFilename,
  runtimeArchBinSha256Filename,
  runtimeBinFilename,
  runtimeBinSha256Filename,
  selfhostTagForVersion,
  resolveHotMultiArchUploadPlan,
  resolveHotUploadPlan,
} from '../scripts/lib/hot-cdn.mjs'

test('normalizeCdnBase strips trailing slashes', () => {
  assert.equal(normalizeCdnBase('https://update.opptrix.org/'), 'https://update.opptrix.org')
  assert.equal(normalizeCdnBase(''), 'https://update.opptrix.org')
})

test('normalizeHotVersion accepts semver and rejects garbage', () => {
  assert.equal(normalizeHotVersion('v1.4.0'), '1.4.0')
  assert.equal(normalizeHotVersion('2.0.0-beta.1'), '2.0.0-beta.1')
  assert.throws(() => normalizeHotVersion('not-a-version'), /invalid version/)
})

test('hot package object keys match CDN layout', () => {
  assert.equal(
    hotPackageObjectKey('1.4.0'),
    `${HOT_PACKAGES_PREFIX}/opptrix-runtime-v1.4.0.bin`,
  )
  assert.equal(
    hotSha256ObjectKey('1.4.0'),
    `${HOT_PACKAGES_PREFIX}/opptrix-runtime-v1.4.0.sha256`,
  )
  assert.equal(runtimeBinFilename('1.4.0'), 'opptrix-runtime-v1.4.0.bin')
  assert.equal(runtimeBinSha256Filename('1.4.0'), 'opptrix-runtime-v1.4.0.sha256')
  assert.equal(runtimeArchBinFilename('1.4.0', 'linux-arm64'), 'opptrix-runtime-linux-arm64-v1.4.0.bin')
  assert.equal(
    runtimeArchBinSha256Filename('1.4.0', 'linux-x64'),
    'opptrix-runtime-linux-x64-v1.4.0.sha256',
  )
})

test('hotPackageUrls build absolute CDN URLs', () => {
  const urls = hotPackageUrls('1.4.0', 'https://cdn.example.com')
  assert.equal(urls.binUrl, 'https://cdn.example.com/hot/packages/opptrix-runtime-v1.4.0.bin')
  assert.equal(urls.sha256Url, 'https://cdn.example.com/hot/packages/opptrix-runtime-v1.4.0.sha256')
})

test('hotCheckUpdateUrl points at hot/check-update', () => {
  assert.equal(
    hotCheckUpdateUrl('https://update.opptrix.org'),
    'https://update.opptrix.org/hot/check-update',
  )
})

test('buildCheckUpdatePayload shape matches client parser expectations', () => {
  const publishedAt = '2026-09-01T08:00:00.000Z'
  const payload = buildCheckUpdatePayload({
    version: '1.4.0',
    cdnBase: 'https://update.opptrix.org',
    packages: {
      'linux-x64': { binSize: 123456789 },
      'linux-arm64': { binSize: 987654321 },
    },
    publishedAt,
    nodeRange: '>=24 <25',
    minBaseImage: 'opptrix-selfhost-v1.4.0',
  })

  assert.equal(payload.channel, 'selfhost')
  assert.equal(typeof payload.latest, 'object')
  assert.equal(payload.latest.version, '1.4.0')
  assert.equal(
    payload.latest.bin,
    'https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.bin',
  )
  assert.equal(
    payload.latest.sha256,
    'https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.sha256',
  )
  assert.equal(payload.latest.size, 123456789)
  assert.equal(payload.latest.publishedAt, publishedAt)
  assert.deepEqual(payload.latest.requires, {
    node: '>=24 <25',
    minBaseImage: 'opptrix-selfhost-v1.4.0',
    platforms: RUNTIME_LINUX_ARCH_KEYS,
  })
  assert.equal(
    payload.latest.packages['linux-x64'].bin,
    'https://update.opptrix.org/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin',
  )
  assert.equal(
    payload.latest.packages['linux-arm64'].bin,
    'https://update.opptrix.org/hot/packages/opptrix-runtime-linux-arm64-v1.4.0.bin',
  )
  assert.equal(payload.latest.packages['linux-arm64'].size, 987654321)
  assert.deepEqual(payload.retention, { max: 8 })
  assert.equal(Array.isArray(payload.releases), true)
  assert.equal(payload.releases.length, 1)
  assert.deepEqual(payload.latest.description, { features: [], fixes: [] })
})

test('buildCheckUpdatePayload accepts legacy single binSize as linux-x64', () => {
  const payload = buildCheckUpdatePayload({
    version: '1.0.0',
    cdnBase: 'https://update.opptrix.org',
    binSize: 42,
    publishedAt: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(payload.latest.size, 42)
  assert.equal(payload.latest.packages['linux-x64'].size, 42)
  assert.deepEqual(payload.latest.requires.platforms, ['linux-x64'])
})

test('buildCheckUpdatePayload defaults minBaseImage from version', () => {
  const payload = buildCheckUpdatePayload({
    version: '2.1.0',
    cdnBase: 'https://update.opptrix.org',
    binSize: 1,
    publishedAt: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(payload.latest.requires.minBaseImage, selfhostTagForVersion('2.1.0'))
})

test('contentTypeForHotObjectKey uses json for check-update and releases', () => {
  assert.equal(contentTypeForHotObjectKey(HOT_CHECK_UPDATE_KEY), 'application/json; charset=utf-8')
  assert.equal(contentTypeForHotObjectKey(HOT_RELEASES_KEY), 'application/json; charset=utf-8')
  assert.equal(
    contentTypeForHotObjectKey('hot/packages/opptrix-runtime-v1.0.0.bin'),
    'application/octet-stream',
  )
})

test('collectHotRuntimeFiles resolves local pack paths', () => {
  const files = collectHotRuntimeFiles('/tmp/dist-runtime', '3.0.0')
  assert.equal(files.binPath, '/tmp/dist-runtime/opptrix-runtime-v3.0.0.bin')
  assert.equal(files.sha256Path, '/tmp/dist-runtime/opptrix-runtime-v3.0.0.sha256')
  assert.equal(files.packageKey, 'hot/packages/opptrix-runtime-v3.0.0.bin')
})

test('hotPurgeUrls includes check-update, releases and version package URLs', () => {
  const urls = hotPurgeUrls('1.4.0', 'https://update.opptrix.org')
  assert.ok(urls.includes('https://update.opptrix.org/hot/check-update'))
  assert.ok(urls.includes('https://update.opptrix.org/hot/releases'))
  assert.ok(urls.includes('https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.bin'))
  assert.ok(urls.includes('https://update.opptrix.org/hot/packages/opptrix-runtime-linux-arm64-v1.4.0.bin'))
})

test('resolveHotMultiArchUploadPlan merges per-arch bins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-hot-multi-'))
  const x64Bin = path.join(dir, 'opptrix-runtime-linux-x64-v9.9.8.bin')
  const x64Sha = path.join(dir, 'opptrix-runtime-linux-x64-v9.9.8.sha256')
  const armBin = path.join(dir, 'opptrix-runtime-linux-arm64-v9.9.8.bin')
  const armSha = path.join(dir, 'opptrix-runtime-linux-arm64-v9.9.8.sha256')
  fs.writeFileSync(x64Bin, 'x64')
  fs.writeFileSync(x64Sha, 'deadbeef  opptrix-runtime-linux-x64-v9.9.8.bin\n')
  fs.writeFileSync(armBin, 'arm64-bytes')
  fs.writeFileSync(armSha, 'cafebabe  opptrix-runtime-linux-arm64-v9.9.8.bin\n')

  const plan = resolveHotMultiArchUploadPlan(dir, '9.9.8')
  assert.equal(plan.version, '9.9.8')
  assert.equal(plan.archPlans.length, 2)
  assert.equal(plan.packages['linux-x64'].binSize, 3)
  assert.equal(plan.packages['linux-arm64'].binSize, 11)

  fs.rmSync(dir, { recursive: true, force: true })
})

test('resolveHotUploadPlan requires .bin and .sha256 on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-hot-'))
  const binPath = path.join(dir, 'opptrix-runtime-linux-x64-v9.9.9.bin')
  const shaPath = path.join(dir, 'opptrix-runtime-linux-x64-v9.9.9.sha256')
  fs.writeFileSync(binPath, 'fake-binary')
  fs.writeFileSync(shaPath, 'deadbeef  opptrix-runtime-linux-x64-v9.9.9.bin\n')

  const plan = resolveHotUploadPlan(dir, '9.9.9')
  assert.equal(plan.version, '9.9.9')
  assert.equal(plan.binSize, fs.statSync(binPath).size)
  assert.equal(plan.files.binPath, binPath)

  fs.rmSync(dir, { recursive: true, force: true })
})

test('resolveHotUploadPlan throws when .bin missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-hot-missing-'))
  assert.throws(
    () => resolveHotUploadPlan(dir, '1.0.0'),
    /missing runtime packages/,
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('sync-hot-to-r2 dry-run exits 0 and prints payload keys', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-hot-dry-'))
  const x64Bin = path.join(dir, 'opptrix-runtime-linux-x64-v0.0.1.bin')
  const x64Sha = path.join(dir, 'opptrix-runtime-linux-x64-v0.0.1.sha256')
  const armBin = path.join(dir, 'opptrix-runtime-linux-arm64-v0.0.1.bin')
  const armSha = path.join(dir, 'opptrix-runtime-linux-arm64-v0.0.1.sha256')
  fs.writeFileSync(x64Bin, 'x'.repeat(64))
  fs.writeFileSync(x64Sha, 'abc  opptrix-runtime-linux-x64-v0.0.1.bin\n')
  fs.writeFileSync(armBin, 'y'.repeat(32))
  fs.writeFileSync(armSha, 'def  opptrix-runtime-linux-arm64-v0.0.1.bin\n')

  const { spawnSync } = await import('node:child_process')
  const script = path.join(process.cwd(), 'scripts/sync-hot-to-r2.mjs')
  const r = spawnSync(
    process.execPath,
    [script, '--dir', dir, '--version', '0.0.1', '--dry-run'],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.match(r.stdout, /linux-x64/)
  assert.match(r.stdout, /linux-arm64/)
  assert.match(r.stdout, /hot\/check-update/)
  assert.match(r.stdout, /hot\/releases/)
  assert.match(r.stdout, /"channel": "selfhost"/)

  fs.rmSync(dir, { recursive: true, force: true })
})
