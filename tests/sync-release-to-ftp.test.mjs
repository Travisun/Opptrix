import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { UPDATE_YML_PUBLIC } from '../apps/desktop/scripts/lib/release-metadata-policy.mjs'
import {
  assertYmlsAtRemoteRoot,
  classifyRemoteRootListing,
  DEFAULT_FTP_FEED_DIR,
  ensureDesktopFeedDir,
  isRemoteInstallerName,
  remotePathFor,
  resolveRemoteDir,
  shouldPruneRemoteName,
} from '../apps/desktop/scripts/sync-release-to-ftp.mjs'
import { partitionUploadBatches } from '../apps/desktop/scripts/sync-release-to-r2.mjs'

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../apps/desktop/scripts/sync-release-to-ftp.mjs',
)

test('remotePathFor joins feed root + basename (absolute)', () => {
  assert.equal(remotePathFor('/desktop', 'latest-mac.yml'), '/desktop/latest-mac.yml')
  assert.equal(remotePathFor('/desktop/', 'latest.yml'), '/desktop/latest.yml')
  assert.equal(remotePathFor('desktop', 'latest-linux.yml'), '/desktop/latest-linux.yml')
  assert.equal(
    remotePathFor('/desktop', 'subdir/latest-mac.yml'),
    '/desktop/latest-mac.yml',
  )
})

test('ensureDesktopFeedDir / resolveRemoteDir keep yml under /desktop', () => {
  assert.equal(DEFAULT_FTP_FEED_DIR, '/desktop')
  assert.equal(ensureDesktopFeedDir('/'), '/desktop')
  assert.equal(ensureDesktopFeedDir('/releases'), '/desktop')
  assert.equal(ensureDesktopFeedDir('/desktop'), '/desktop')
  assert.equal(ensureDesktopFeedDir('/desktop/'), '/desktop')
  assert.equal(ensureDesktopFeedDir('/mirror/desktop'), '/mirror/desktop')
  assert.equal(ensureDesktopFeedDir('/desktop/archives'), '/desktop')

  assert.equal(resolveRemoteDir({ FTP_REMOTE_DIR: '/' }), '/desktop')
  assert.equal(resolveRemoteDir({ FTP_REMOTE_DIR: '' }), '/desktop')
  assert.equal(resolveRemoteDir({ FTP_REMOTE_DIR: 'desktop' }), '/desktop')
  assert.equal(resolveRemoteDir({ FTP_REMOTE_DIR: '/desktop' }), '/desktop')
  assert.equal(
    remotePathFor(resolveRemoteDir({ FTP_REMOTE_DIR: '/' }), 'latest-mac.yml'),
    '/desktop/latest-mac.yml',
  )
})

test('remotePathFor rejects empty / traversal names', () => {
  assert.throws(() => remotePathFor('/desktop', ''), /Invalid remote file name/)
  assert.throws(() => remotePathFor('/desktop', '.'), /Invalid remote file name/)
  assert.throws(() => remotePathFor('/desktop', '..'), /Invalid remote file name/)
})

test('assertYmlsAtRemoteRoot accepts root files and rejects nested names', () => {
  assertYmlsAtRemoteRoot([
    { name: 'latest-mac.yml', isFile: true },
    { name: 'latest.yml', isFile: true },
    { name: 'latest-linux.yml', isFile: true },
    { name: 'Opptrix-1.0.0.dmg', isFile: true },
    { name: 'archives', isDirectory: true, isFile: false },
  ])

  assert.throws(
    () => assertYmlsAtRemoteRoot([
      { name: 'latest-mac.yml', isFile: true },
      { name: 'latest.yml', isFile: true },
      // path-like name must not count as root
      { name: 'nested/latest-linux.yml', isFile: true },
    ]),
    /latest-linux\.yml/,
  )

  assert.throws(
    () => assertYmlsAtRemoteRoot([
      { name: 'latest-mac.yml', isFile: true },
      { name: 'latest.yml', isFile: true },
      { name: 'latest-linux.yml', isDirectory: true, isFile: false },
    ]),
    /latest-linux\.yml/,
  )
})

test('assertYmlsAtRemoteRoot defaults to UPDATE_YML_PUBLIC', () => {
  assert.deepEqual([...UPDATE_YML_PUBLIC], [
    'latest-mac.yml',
    'latest.yml',
    'latest-linux.yml',
  ])
  assert.throws(
    () => assertYmlsAtRemoteRoot([{ name: 'latest.yml', isFile: true }]),
    /latest-mac\.yml/,
  )
})

test('isRemoteInstallerName matches installer extensions only', () => {
  assert.equal(isRemoteInstallerName('Opptrix-1.3.4-mac.dmg'), true)
  assert.equal(isRemoteInstallerName('Opptrix-1.3.4-mac.zip'), true)
  assert.equal(isRemoteInstallerName('Opptrix-Setup-1.3.4.exe'), true)
  assert.equal(isRemoteInstallerName('Opptrix-1.3.4.AppImage'), true)
  assert.equal(isRemoteInstallerName('opptrix_1.3.4_amd64.deb'), true)
  assert.equal(isRemoteInstallerName('latest-mac.yml'), false)
  assert.equal(isRemoteInstallerName('Opptrix-1.3.4-mac.zip.blockmap'), false)
  assert.equal(isRemoteInstallerName('Opptrix-1.3.4.AppImage.opptrix-cms'), false)
  assert.equal(isRemoteInstallerName('nested/foo.dmg'), false)
})

test('shouldPruneRemoteName keeps current release; prunes obsolete + per-arch yml', () => {
  const keep = new Set([
    'Opptrix-1.3.4.dmg',
    'Opptrix-1.3.4.zip',
    'latest-mac.yml',
    'latest.yml',
    'latest-linux.yml',
  ])
  assert.equal(shouldPruneRemoteName('Opptrix-1.3.4.dmg', keep), false)
  assert.equal(shouldPruneRemoteName('latest-mac.yml', keep), false)
  assert.equal(shouldPruneRemoteName('Opptrix-1.3.3.dmg', keep), true)
  assert.equal(shouldPruneRemoteName('Opptrix-1.3.3.zip.blockmap', keep), true)
  assert.equal(shouldPruneRemoteName('latest-mac-arm64.yml', keep), true)
  assert.equal(shouldPruneRemoteName('latest-mac-x64.yml', keep), true)
  assert.equal(shouldPruneRemoteName('readme.txt', keep), false)
  assert.equal(shouldPruneRemoteName('archives', keep), false)
})

test('classifyRemoteRootListing splits keep / obsolete installers and release orphans', () => {
  const keep = new Set([
    'Opptrix-1.3.4.dmg',
    'Opptrix-1.3.4.zip',
    'latest-mac.yml',
    'latest.yml',
    'latest-linux.yml',
  ])
  const listing = [
    { name: 'Opptrix-1.3.4.dmg', isFile: true },
    { name: 'Opptrix-1.3.3.dmg', isFile: true },
    { name: 'Opptrix-1.3.3.zip.blockmap', isFile: true },
    { name: 'latest-mac.yml', isFile: true },
    { name: 'latest.yml', isFile: true },
    { name: 'latest-linux.yml', isFile: true },
    { name: 'latest-mac-arm64.yml', isFile: true },
    { name: 'archives', isDirectory: true, isFile: false },
    { name: 'nested/old.dmg', isFile: true },
  ]
  const result = classifyRemoteRootListing(listing, keep)
  assert.deepEqual(result.installersKept, ['Opptrix-1.3.4.dmg'])
  assert.deepEqual(result.installersObsolete, ['Opptrix-1.3.3.dmg'])
  assert.deepEqual(result.releaseObsolete, [
    'Opptrix-1.3.3.dmg',
    'Opptrix-1.3.3.zip.blockmap',
    'latest-mac-arm64.yml',
  ])
  assert.deepEqual(result.ymlsPresent, [
    'latest-linux.yml',
    'latest-mac.yml',
    'latest.yml',
  ])
})

test('partitionUploadBatches (shared) puts yml after binaries for FTP', () => {
  const files = [
    { name: 'latest-mac.yml' },
    { name: 'Opptrix-1.0.0.exe' },
    { name: 'latest.yml' },
    { name: 'Opptrix-1.0.0.dmg' },
    { name: 'latest-linux.yml' },
  ]
  const { binaries, ymls } = partitionUploadBatches(files)
  assert.ok(binaries.every((f) => !/\.yml$/i.test(f.name)))
  assert.deepEqual(
    ymls.map((f) => f.name),
    ['latest-mac.yml', 'latest.yml', 'latest-linux.yml'],
  )
})

test('sync-release-to-ftp contract: binaries → list → overwrite yml → prune → assert', () => {
  const src = fs.readFileSync(scriptPath, 'utf8')
  assert.ok(src.includes('DEFAULT_FTP_FEED_DIR'), 'must define /desktop feed dir')
  assert.ok(src.includes('ensureDesktopFeedDir'), 'must coerce remote dir under /desktop')
  assert.ok(src.includes('/desktop'), 'yml+installers live under /desktop')
  assert.ok(src.includes('partitionUploadBatches'), 'must partition binary vs yml')
  assert.ok(src.includes('classifyRemoteRootListing'), 'must classify remote listing')
  assert.ok(src.includes('shouldPruneRemoteName'), 'must use prune helper')
  assert.ok(src.includes('[ftp] remote installers'), 'must log installer inventory')
  assert.ok(src.includes('removing obsolete installer:'), 'must log obsolete installer deletes')
  assert.ok(src.includes('overwrite yml'), 'must force-overwrite public yml')
  assert.ok(src.includes('[ftp] yml root:'), 'must log yml root paths')
  assert.ok(src.includes('uploadBatch(binaries)'), 'must upload binaries first')

  const binariesIdx = src.indexOf('uploadBatch(binaries)')
  const classifyIdx = src.indexOf('classifyRemoteRootListing(listingBeforePrune')
  const overwriteIdx = src.indexOf('uploadBatch(ymls, { overwrite: true })')
  const pruneLoopIdx = src.indexOf('classified.releaseObsolete')
  const assertIdx = src.indexOf('assertYmlsAtRemoteRoot(listingFinal)')
  assert.ok(binariesIdx >= 0, 'binaries upload present')
  assert.ok(classifyIdx > binariesIdx, 'LIST/classify after binaries')
  assert.ok(overwriteIdx > classifyIdx, 'yml overwrite after list (before prune)')
  assert.ok(pruneLoopIdx > overwriteIdx, 'prune after yml overwrite')
  assert.ok(assertIdx > pruneLoopIdx, 'assert after prune')

  assert.ok(
    /await client\.cd\(remoteDir\)/.test(src),
    'must cd to remoteDir before list/upload insurance',
  )
  assert.ok(
    src.includes('uploadFrom(file.filePath, remoteName)')
      || /uploadFrom\([^,]+,\s*remoteName\)/.test(src),
    'must STOR by basename after cd(remoteDir) — avoid absolute path double-prefix',
  )
  assert.ok(src.includes('client.size(yml)'), 'must size-check each public yml at feed root')
  assert.ok(src.includes('client.remove(name)'), 'must delete obsolete remote names')
})
