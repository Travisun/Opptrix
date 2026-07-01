import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveFeedUrl, detectAtomFromXml } from '../packages/news-feed/dist/url.js'
import { parseFeedXml, articleId } from '../packages/news-feed/dist/parser.js'

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>测试源</title>
    <item>
      <title>第一条</title>
      <link>https://example.com/a/1</link>
      <guid isPermaLink="true">https://example.com/a/1</guid>
      <pubDate>Mon, 01 Jan 2024 08:00:00 GMT</pubDate>
      <description>摘要文本</description>
      <content:encoded><![CDATA[<p>正文 HTML</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

const ATOM_HEAD = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/atom">
  <title>Atom Feed</title>
</feed>`

const stubSub = {
  id: 'sub-1',
  title: 'stub',
  url: 'https://example.com/feed.xml',
  resolved_url: 'https://example.com/feed.xml',
  kind: 'rss',
  enabled: true,
  created_at: '2024-01-01T00:00:00.000Z',
}

test('resolveFeedUrl: https RSS', () => {
  const r = resolveFeedUrl('https://example.com/feed.xml')
  assert.equal(r.resolved_url, 'https://example.com/feed.xml')
  assert.equal(r.kind, 'rss')
})

test('resolveFeedUrl: rsshub host uses full URL', () => {
  const r = resolveFeedUrl('https://rsshub.example.com/eastmoney/report')
  assert.equal(r.resolved_url, 'https://rsshub.example.com/eastmoney/report')
  assert.equal(r.kind, 'rsshub')
})

test('resolveFeedUrl: rejects non-http', () => {
  assert.throws(() => resolveFeedUrl('rsshub://eastmoney/report'), /http/)
})

test('detectAtomFromXml', () => {
  assert.equal(detectAtomFromXml(ATOM_HEAD), true)
  assert.equal(detectAtomFromXml(RSS_SAMPLE), false)
})

test('parseFeedXml parses RSS items', async () => {
  const { title, items, kind } = await parseFeedXml(RSS_SAMPLE, stubSub)
  assert.equal(title, '测试源')
  assert.equal(kind, 'rss')
  assert.equal(items.length, 1)
  assert.equal(items[0].title, '第一条')
  assert.ok(items[0].content_html?.includes('正文 HTML'))
})

test('articleId is stable for same guid', () => {
  const a = articleId('sub-1', 'guid-abc')
  assert.equal(a, articleId('sub-1', 'guid-abc'))
  assert.notEqual(a, articleId('sub-2', 'guid-abc'))
})
