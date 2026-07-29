import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareUploadOrder,
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
