import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareUploadOrder,
  mapPool,
  partitionUploadBatches,
  resolveUploadConcurrency,
  shouldUpload,
} from '../apps/desktop/scripts/sync-release-to-r2.mjs'

test('shouldUpload includes Linux CMS signatures and public yml', () => {
  assert.equal(shouldUpload('Opptrix-1.2.6-Linux.AppImage.opptrix-cms'), true)
  assert.equal(shouldUpload('Opptrix-1.2.6-Linux.deb.opptrix-cms'), true)
  assert.equal(shouldUpload('latest-linux.yml'), true)
  assert.equal(shouldUpload('Opptrix-1.2.6-Windows.exe'), true)
})

test('shouldUpload skips arch-specific mac yml and unrelated files', () => {
  assert.equal(shouldUpload('latest-mac-arm64.yml'), false)
  assert.equal(shouldUpload('latest-mac-x64.yml'), false)
  assert.equal(shouldUpload('NOTES.md'), false)
  assert.equal(shouldUpload('builder-debug.yml'), true)
})

test('compareUploadOrder puts latest yml after binaries and cms', () => {
  const names = [
    'latest.yml',
    'Opptrix-1.2.6-Linux.AppImage.opptrix-cms',
    'Opptrix-1.2.6-Windows.exe',
    'latest-mac.yml',
  ]
  const sorted = [...names].sort(compareUploadOrder)
  assert.deepEqual(sorted, [
    'Opptrix-1.2.6-Linux.AppImage.opptrix-cms',
    'Opptrix-1.2.6-Windows.exe',
    'latest-mac.yml',
    'latest.yml',
  ])
})

test('partitionUploadBatches keeps yml after all binaries', () => {
  const files = [
    { name: 'latest.yml' },
    { name: 'Opptrix-1.2.6-Windows.exe' },
    { name: 'latest-mac.yml' },
    { name: 'Opptrix-1.2.6.dmg' },
    { name: 'Opptrix-1.2.6.blockmap' },
  ]
  const { binaries, ymls } = partitionUploadBatches(files)
  assert.deepEqual(
    binaries.map((f) => f.name),
    [
      'Opptrix-1.2.6-Windows.exe',
      'Opptrix-1.2.6.dmg',
      'Opptrix-1.2.6.blockmap',
    ],
  )
  assert.deepEqual(
    ymls.map((f) => f.name),
    ['latest.yml', 'latest-mac.yml'],
  )
  assert.ok(binaries.every((f) => !/\.yml$/i.test(f.name)))
  assert.ok(ymls.every((f) => /\.yml$/i.test(f.name)))
})

test('resolveUploadConcurrency defaults to 4 and clamps 1–8', () => {
  assert.equal(resolveUploadConcurrency(undefined), 4)
  assert.equal(resolveUploadConcurrency(''), 4)
  assert.equal(resolveUploadConcurrency('not-a-number'), 4)
  assert.equal(resolveUploadConcurrency('4'), 4)
  assert.equal(resolveUploadConcurrency('1'), 1)
  assert.equal(resolveUploadConcurrency('8'), 8)
  assert.equal(resolveUploadConcurrency('0'), 1)
  assert.equal(resolveUploadConcurrency('-3'), 1)
  assert.equal(resolveUploadConcurrency('99'), 8)
})

test('mapPool respects concurrency and preserves completion of all items', async () => {
  const items = [1, 2, 3, 4, 5, 6]
  let inFlight = 0
  let maxInFlight = 0
  const seen = []

  await mapPool(items, 3, async (item) => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 15))
    seen.push(item)
    inFlight -= 1
  })

  assert.equal(maxInFlight, 3)
  assert.deepEqual([...seen].sort((a, b) => a - b), items)
})

test('mapPool rejects when a worker fails', async () => {
  await assert.rejects(
    () => mapPool([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error('boom')
    }),
    /boom/,
  )
})

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentTypeForFileName } from '../apps/desktop/scripts/lib/r2-client.mjs'

test('contentTypeForFileName uses octet-stream for Linux installers and CMS', () => {
  assert.equal(contentTypeForFileName('Opptrix-1.3.1-Linux.AppImage'), 'application/octet-stream')
  assert.equal(contentTypeForFileName('Opptrix-1.3.1-Linux.deb'), 'application/octet-stream')
  assert.equal(contentTypeForFileName('Opptrix-1.3.1-Linux.AppImage.opptrix-cms'), 'application/octet-stream')
  assert.equal(contentTypeForFileName('latest-linux.yml'), 'text/yaml; charset=utf-8')
})

test('sync-release-to-r2 uploads binaries via mapPool before yml, then prune+verify', () => {
  const scriptPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../apps/desktop/scripts/sync-release-to-r2.mjs',
  )
  const src = fs.readFileSync(scriptPath, 'utf8')
  assert.ok(src.includes('OPPTRIX_R2_UPLOAD_CONCURRENCY'), 'concurrency env must be wired')
  assert.ok(src.includes('partitionUploadBatches'), 'must partition binary vs yml')
  assert.ok(src.includes('mapPool(binaries'), 'must parallel-upload binaries first')
  assert.ok(src.includes('mapPool(ymls'), 'must upload yml after binaries')
  const binariesIdx = src.indexOf('mapPool(binaries')
  const ymlsIdx = src.indexOf('mapPool(ymls')
  assert.ok(binariesIdx >= 0 && ymlsIdx > binariesIdx, 'yml mapPool must follow binaries mapPool')
  assert.ok(src.includes('assertObjectPresent'), 'per-object size assert must remain')
  assert.ok(src.includes('deleteObjectKeys'), 'prune must remain')
  assert.ok(
    /verified \$\{files\.length\} object\(s\) still present after prune/.test(src),
    'final post-prune verify must remain',
  )
})
