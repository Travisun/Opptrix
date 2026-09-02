import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGiteeCreateReleaseForm,
  parseGiteeReleaseId,
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
