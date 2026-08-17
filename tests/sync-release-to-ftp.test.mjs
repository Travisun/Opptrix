import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { UPDATE_YML_PUBLIC } from '../apps/desktop/scripts/lib/release-metadata-policy.mjs'
import {
  assertYmlsAtRemoteRoot,
  remotePathFor,
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
  assert.equal(remotePathFor('/', 'latest.yml'), '/latest.yml')
  assert.equal(
    remotePathFor('/desktop', 'subdir/latest-mac.yml'),
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

test('sync-release-to-ftp contract: partition + absolute root + yml assert', () => {
  const src = fs.readFileSync(scriptPath, 'utf8')
  assert.ok(src.includes('partitionUploadBatches'), 'must partition binary vs yml')
  assert.ok(src.includes('remotePathFor'), 'must use absolute remote paths')
  assert.ok(src.includes('assertYmlsAtRemoteRoot'), 'must hard-assert yml at feed root')
  assert.ok(src.includes('[ftp] yml root:'), 'must log yml root paths')
  assert.ok(src.includes('uploadBatch(binaries)'), 'must upload binaries first')
  assert.ok(src.includes('uploadBatch(ymls)'), 'must upload yml after binaries')
  const binariesIdx = src.indexOf('uploadBatch(binaries)')
  const ymlsIdx = src.indexOf('uploadBatch(ymls)')
  assert.ok(binariesIdx >= 0 && ymlsIdx > binariesIdx, 'yml batch must follow binaries')
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
  assert.ok(
    src.includes('entry.isFile && shouldUpload(entry.name)'),
    'prune must stay on remoteDir root files only',
  )
})
