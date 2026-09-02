import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGiteeReleaseId } from '../scripts/upload-runtime-gitee.mjs'

test('parseGiteeReleaseId tolerates null / empty payloads', () => {
  assert.equal(parseGiteeReleaseId(null), null)
  assert.equal(parseGiteeReleaseId(undefined), null)
  assert.equal(parseGiteeReleaseId('x'), null)
  assert.equal(parseGiteeReleaseId([]), null)
  assert.equal(parseGiteeReleaseId({}), null)
  assert.equal(parseGiteeReleaseId({ id: '1' }), null)
  assert.equal(parseGiteeReleaseId({ id: 42 }), 42)
})
