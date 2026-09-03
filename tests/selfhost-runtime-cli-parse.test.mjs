import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRuntimeCliJson } from '../packages/selfhost/src/docker-runtime.mjs'

test('parseRuntimeCliJson reads last JSON line', () => {
  const stdout = [
    'noise from docker',
    '{"ok":true,"command":"list-local","currentVersion":"1.4.5"}',
    '{"ok":true,"command":"fetch-releases","releases":[{"version":"1.4.6"}]}',
  ].join('\n')
  const payload = parseRuntimeCliJson(stdout)
  assert.equal(payload?.ok, true)
  assert.equal(payload?.command, 'fetch-releases')
  assert.equal(payload?.releases?.[0]?.version, '1.4.6')
})

test('parseRuntimeCliJson returns null for empty / garbage', () => {
  assert.equal(parseRuntimeCliJson(''), null)
  assert.equal(parseRuntimeCliJson('not json\nstill not'), null)
})
