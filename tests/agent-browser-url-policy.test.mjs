import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertAllowedUrl,
  normalizeUrl,
  UrlPolicyError,
  normalizeRef,
  RefNotFoundError,
  RefMap,
  truncateSnapshot,
} from '../packages/agent-browser/dist/index.js'

test('assertAllowedUrl accepts http and https', () => {
  const http = assertAllowedUrl('http://example.com/path')
  assert.equal(http.protocol, 'http:')
  const https = assertAllowedUrl('https://example.org/foo?bar=1')
  assert.equal(https.hostname, 'example.org')
})

test('assertAllowedUrl rejects non-http protocols', () => {
  const blocked = [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hello',
    'blob:https://example.com/uuid',
    'about:blank',
    'ftp://example.com',
  ]
  for (const url of blocked) {
    assert.throws(() => assertAllowedUrl(url), UrlPolicyError)
  }
})

test('assertAllowedUrl rejects empty and malformed URLs', () => {
  assert.throws(() => assertAllowedUrl(''), UrlPolicyError)
  assert.throws(() => assertAllowedUrl('   '), UrlPolicyError)
  assert.throws(() => assertAllowedUrl('not-a-url'), UrlPolicyError)
})

test('normalizeUrl returns canonical href', () => {
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com/')
})

test('normalizeRef accepts eN and [ref=eN] forms', () => {
  assert.equal(normalizeRef('e12'), 'e12')
  assert.equal(normalizeRef('[ref=e12]'), 'e12')
  assert.throws(() => normalizeRef('button-submit'), RefNotFoundError)
})

test('RefMap registers refs from snapshot text', () => {
  const map = new RefMap()
  const count = map.registerFromSnapshot('- button "Go" [ref=e1]\n- link "Home" [ref=e2]')
  assert.equal(count, 2)
  assert.equal(map.assertKnown('e1'), 'e1')
  assert.throws(() => map.assertKnown('e99'), RefNotFoundError)
})

test('truncateSnapshot respects max_chars', () => {
  const { text, truncated } = truncateSnapshot('abcdefghij', 5)
  assert.equal(truncated, true)
  assert.ok(text.startsWith('abcde'))
})
