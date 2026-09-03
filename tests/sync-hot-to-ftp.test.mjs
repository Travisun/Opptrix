import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOT_PACKAGES_PREFIX,
  HOT_RELEASES_RETENTION_MAX,
  buildHotPackageKeepNames,
  ensureRemoteDirIfMissing,
  isHotRuntimePackageArtifact,
  joinHotFtpRemotePath,
  listingFileNames,
  resolveHotFtpRemoteDir,
  selectHotPackageFilesToPrune,
} from '../scripts/lib/hot-ftp.mjs'

test('resolveHotFtpRemoteDir defaults to login home (relative)', () => {
  assert.equal(resolveHotFtpRemoteDir({}), '')
  assert.equal(resolveHotFtpRemoteDir({ FTP_REMOTE_DIR: '/' }), '')
  assert.equal(resolveHotFtpRemoteDir({ FTP_REMOTE_DIR: '.' }), '')
  assert.equal(resolveHotFtpRemoteDir({ FTP_REMOTE_DIR: 'cdn' }), 'cdn')
  assert.equal(resolveHotFtpRemoteDir({ FTP_REMOTE_DIR: '/cdn/' }), 'cdn')
})

test('joinHotFtpRemotePath uses chroot-relative paths', () => {
  assert.equal(
    joinHotFtpRemotePath('', 'hot/check-update'),
    'hot/check-update',
  )
  assert.equal(
    joinHotFtpRemotePath('/', `${HOT_PACKAGES_PREFIX}/opptrix-runtime-v1.4.5.bin`),
    'hot/packages/opptrix-runtime-v1.4.5.bin',
  )
  assert.equal(
    joinHotFtpRemotePath('/site', 'hot/releases'),
    'site/hot/releases',
  )
  assert.throws(() => joinHotFtpRemotePath('', '../etc/passwd'), /invalid/)
})

test('isHotRuntimePackageArtifact matches arch + legacy names', () => {
  assert.equal(isHotRuntimePackageArtifact('opptrix-runtime-v1.4.5.bin'), true)
  assert.equal(isHotRuntimePackageArtifact('opptrix-runtime-v1.4.5.sha256'), true)
  assert.equal(isHotRuntimePackageArtifact('opptrix-runtime-linux-x64-v1.4.5.bin'), true)
  assert.equal(isHotRuntimePackageArtifact('opptrix-runtime-linux-arm64-v1.4.5.sha256'), true)
  assert.equal(isHotRuntimePackageArtifact('check-update'), false)
  assert.equal(isHotRuntimePackageArtifact('hot/packages/foo.bin'), false)
  assert.equal(isHotRuntimePackageArtifact('readme.txt'), false)
})

test('buildHotPackageKeepNames + prune respects retention versions', () => {
  const keep = buildHotPackageKeepNames(['1.4.5', '1.4.4'])
  assert.ok(keep.has('opptrix-runtime-linux-x64-v1.4.5.bin'))
  assert.ok(keep.has('opptrix-runtime-v1.4.4.sha256'))
  assert.equal(keep.size, 12) // 2 versions × (legacy bin+sha + 2 arch × bin+sha)

  const remote = [
    'opptrix-runtime-linux-x64-v1.4.5.bin',
    'opptrix-runtime-linux-x64-v1.4.0.bin',
    'opptrix-runtime-v1.4.0.bin',
    'notes.txt',
    'opptrix-runtime-linux-arm64-v1.4.4.sha256',
  ]
  const prune = selectHotPackageFilesToPrune(remote, keep)
  assert.deepEqual(prune, [
    'opptrix-runtime-linux-x64-v1.4.0.bin',
    'opptrix-runtime-v1.4.0.bin',
  ])
})

test('HOT_RELEASES_RETENTION_MAX stays 8 for FTP policy', () => {
  assert.equal(HOT_RELEASES_RETENTION_MAX, 8)
})

test('listingFileNames skips directories', () => {
  const names = listingFileNames([
    { name: 'a.bin', isFile: true },
    { name: 'sub', isDirectory: true },
    { name: 'b.sha256', type: 1 },
    { name: 'nested/x.bin', isFile: true },
  ])
  assert.deepEqual(names, ['a.bin', 'b.sha256'])
})

test('ensureRemoteDirIfMissing creates only missing relative segments', async () => {
  /** @type {string[]} */
  const listed = []
  /** @type {string[]} */
  const ensured = []
  const client = {
    async list(dir) {
      listed.push(dir)
      if (dir === 'hot') return []
      throw new Error('missing')
    },
    async ensureDir(dir) {
      ensured.push(dir)
    },
  }
  const result = await ensureRemoteDirIfMissing(client, 'hot/packages')
  assert.equal(result.path, 'hot/packages')
  assert.deepEqual(result.created, ['hot/packages'])
  assert.ok(listed.includes('hot'))
  assert.ok(listed.includes('hot/packages'))
  assert.deepEqual(ensured, ['hot/packages'])
})
