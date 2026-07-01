import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SUBSCRIPTION_EXPORT_SCHEMA_VERSION,
  buildSubscriptionExportFile,
  parseSubscriptionExportJson,
  parseSubscriptionExportPayload,
} from '../packages/news-feed/dist/subscription-transfer.js'

test('buildSubscriptionExportFile uses schema version and url/title only', () => {
  const file = buildSubscriptionExportFile([
    { url: 'https://example.com/feed.xml', title: '示例' },
  ])
  assert.equal(file.schema_version, SUBSCRIPTION_EXPORT_SCHEMA_VERSION)
  assert.deepEqual(file.subscriptions, [
    { url: 'https://example.com/feed.xml', title: '示例' },
  ])
})

test('parseSubscriptionExportJson accepts title or legacy name field', () => {
  const raw = JSON.stringify({
    schema_version: 1,
    subscriptions: [
      { url: 'https://a.test/rss', title: 'A' },
      { url: 'https://b.test/rss', name: 'B' },
    ],
  })
  const parsed = parseSubscriptionExportJson(raw)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.data.subscriptions.length, 2)
  assert.equal(parsed.data.subscriptions[1]?.title, 'B')
})

test('parseSubscriptionExportPayload rejects unsupported schema version', () => {
  const parsed = parseSubscriptionExportPayload({
    schema_version: 99,
    subscriptions: [{ url: 'https://x.test' }],
  })
  assert.equal(parsed.ok, false)
})

test('parseSubscriptionExportJson rejects empty subscriptions', () => {
  const parsed = parseSubscriptionExportJson(JSON.stringify({
    schema_version: 1,
    subscriptions: [{ url: '   ' }],
  }))
  assert.equal(parsed.ok, false)
})
