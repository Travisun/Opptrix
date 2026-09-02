import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildGiteeCreateReleaseForm,
  orderAssetsForUpload,
  parseGiteeReleaseId,
  resolveGiteeUploadPolicy,
} from '../scripts/upload-runtime-gitee.mjs'

test('parseGiteeReleaseId tolerates null / empty payloads', () => {
  assert.equal(parseGiteeReleaseId(null), null)
  assert.equal(parseGiteeReleaseId(undefined), null)
  assert.equal(parseGiteeReleaseId('x'), null)
  assert.equal(parseGiteeReleaseId([]), null)
  assert.equal(parseGiteeReleaseId({}), null)
  assert.equal(parseGiteeReleaseId({ id: '1' }), null)
  assert.equal(parseGiteeReleaseId({ id: 42 }), 42)
})

test('buildGiteeCreateReleaseForm includes required target_commitish', () => {
  const form = buildGiteeCreateReleaseForm('runtime-v1.4.4', {
    token: 'tok',
    targetCommitish: 'main',
  })
  assert.equal(form.get('tag_name'), 'runtime-v1.4.4')
  assert.equal(form.get('name'), 'runtime-v1.4.4')
  assert.equal(form.get('access_token'), 'tok')
  assert.equal(form.get('target_commitish'), 'main')
  assert.equal(form.get('prerelease'), 'false')
})

test('buildGiteeCreateReleaseForm defaults target_commitish to main', () => {
  const prev = process.env.OPPTRIX_UPDATE_GITEE_TARGET
  delete process.env.OPPTRIX_UPDATE_GITEE_TARGET
  try {
    const form = buildGiteeCreateReleaseForm('runtime-v9.9.9', { token: 't' })
    assert.equal(form.get('target_commitish'), 'main')
  } finally {
    if (prev === undefined) delete process.env.OPPTRIX_UPDATE_GITEE_TARGET
    else process.env.OPPTRIX_UPDATE_GITEE_TARGET = prev
  }
})

test('resolveGiteeUploadPolicy defaults and env overrides', () => {
  const prevT = process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_TIMEOUT_MS
  const prevR = process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_RETRIES
  delete process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_TIMEOUT_MS
  delete process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_RETRIES
  try {
    assert.deepEqual(resolveGiteeUploadPolicy(), { timeoutMs: 900_000, retries: 5 })
    process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_TIMEOUT_MS = '120000'
    process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_RETRIES = '3'
    assert.deepEqual(resolveGiteeUploadPolicy(), { timeoutMs: 120_000, retries: 3 })
  } finally {
    if (prevT === undefined) delete process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_TIMEOUT_MS
    else process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_TIMEOUT_MS = prevT
    if (prevR === undefined) delete process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_RETRIES
    else process.env.OPPTRIX_UPDATE_GITEE_UPLOAD_RETRIES = prevR
  }
})

test('orderAssetsForUpload sorts by ascending size', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitee-upload-order-'))
  try {
    const small = path.join(dir, 'a.sha256')
    const big = path.join(dir, 'b.bin')
    fs.writeFileSync(small, 'x')
    fs.writeFileSync(big, 'y'.repeat(4096))
    const ordered = orderAssetsForUpload([big, small])
    assert.deepEqual(ordered.map((p) => path.basename(p)), ['a.sha256', 'b.bin'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
