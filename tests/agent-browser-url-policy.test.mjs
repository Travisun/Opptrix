import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertAllowedUrl,
  assertAllowedUrlAsync,
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

test('assertAllowedUrl rejects localhost / private / metadata (C1 SSRF baseline)', () => {
  const blocked = [
    'http://localhost/',
    'https://foo.localhost/bar',
    'http://printer.local/',
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://172.16.5.1/',
    'http://192.168.1.1/',
    'http://169.254.1.1/',
    'http://0.0.0.0/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/',
    'http://[::1]/',
    'http://[fe80::1]/',
    'http://[fd12:3456:789a::1]/',
  ]
  for (const url of blocked) {
    assert.throws(() => assertAllowedUrl(url), UrlPolicyError)
  }
})

test('normalizeUrl returns canonical href', () => {
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com/')
})

test('assertAllowedUrlAsync rejects DNS→private (injectable lookup)', async () => {
  await assert.rejects(
    () =>
      assertAllowedUrlAsync('https://evil.example/', {
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      }),
    UrlPolicyError,
  )
  await assert.rejects(
    () =>
      assertAllowedUrlAsync('https://meta.example/', {
        lookup: async () => [{ address: '169.254.169.254', family: 4 }],
      }),
    UrlPolicyError,
  )
})

test('assertAllowedUrlAsync allows public DNS resolution', async () => {
  const parsed = await assertAllowedUrlAsync('https://cdn.example/path', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  })
  assert.equal(parsed.hostname, 'cdn.example')
})

test('assertAllowedUrlAsync allowLan skips private rejection (literal + DNS)', async () => {
  const lan = await assertAllowedUrlAsync('http://192.168.1.50/', { allowLan: true })
  assert.equal(lan.hostname, '192.168.1.50')

  const viaDns = await assertAllowedUrlAsync('http://nas.home/', {
    allowLan: true,
    lookup: async () => [{ address: '10.0.0.2', family: 4 }],
  })
  assert.equal(viaDns.hostname, 'nas.home')
})

test('assertAllowedUrlAsync allowLan still blocks metadata IP + weird schemes', async () => {
  await assert.rejects(
    () => assertAllowedUrlAsync('http://169.254.169.254/', { allowLan: true }),
    UrlPolicyError,
  )
  await assert.rejects(
    () => assertAllowedUrlAsync('javascript:alert(1)', { allowLan: true }),
    UrlPolicyError,
  )
})

test('assertAllowedUrlAsync rejects unresolvable hostname', async () => {
  await assert.rejects(
    () =>
      assertAllowedUrlAsync('https://no-such-host.invalid/', {
        lookup: async () => {
          throw new Error('ENOTFOUND')
        },
      }),
    (err) => err instanceof UrlPolicyError && /resolve/i.test(err.message),
  )
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
