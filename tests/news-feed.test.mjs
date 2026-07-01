import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveFeedUrl, detectAtomFromXml, subscriptionUrlKey, isSameSubscriptionUrl } from '../packages/news-feed/dist/url.js'
import { parseFeedXml, articleId } from '../packages/news-feed/dist/parser.js'
import {
  extractTwitterStatusId,
  normalizeFeedItemDedupeKey,
  resolveTwitterFeedTitle,
} from '../packages/news-feed/dist/twitter-guid.js'

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

test('subscriptionUrlKey normalizes trailing slash', () => {
  const a = subscriptionUrlKey('https://example.com/feed.xml')
  const b = subscriptionUrlKey('https://example.com/feed.xml/')
  assert.equal(a, b)
})

test('isSameSubscriptionUrl matches resolved variants', () => {
  assert.equal(
    isSameSubscriptionUrl('https://example.com/feed', 'https://example.com/feed/'),
    true,
  )
  assert.equal(
    isSameSubscriptionUrl('https://example.com/feed', 'https://other.com/feed'),
    false,
  )
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

const TWITTER_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Twitter @Donald J. Trump</title>
    <item>
      <title>RT Donald J. Trump: Re POLL…</title>
      <link>https://x.com/realDonaldTrump/status/2068431819603611979</link>
      <guid isPermaLink="false">https://twitter.com/realDonaldTrump/status/2068431819603611979</guid>
      <pubDate>Sat, 20 Jun 2026 16:28:50 GMT</pubDate>
      <description>RT Donald J. Trump&lt;br&gt;Re POLL…</description>
    </item>
    <item>
      <title></title>
      <link>https://x.com/realDonaldTrump/status/2057968277062582378</link>
      <guid isPermaLink="false">https://twitter.com/realDonaldTrump/status/2057968277062582378</guid>
      <pubDate>Fri, 22 May 2026 23:34:07 GMT</pubDate>
      <description>&lt;br&gt;&lt;video src="https://video.twimg.com/vid.mp4"&gt;&lt;/video&gt;</description>
    </item>
  </channel>
</rss>`

test('extractTwitterStatusId accepts twitter.com and x.com', () => {
  assert.equal(
    extractTwitterStatusId('https://twitter.com/user/status/123456'),
    '123456',
  )
  assert.equal(
    extractTwitterStatusId('https://x.com/user/status/123456'),
    '123456',
  )
})

test('normalizeFeedItemDedupeKey unifies twitter.com guid and x.com link', () => {
  const fromGuid = normalizeFeedItemDedupeKey(
    'https://twitter.com/realDonaldTrump/status/99',
    'https://x.com/realDonaldTrump/status/99',
  )
  const fromLinkOnly = normalizeFeedItemDedupeKey(
    '',
    'https://x.com/realDonaldTrump/status/99',
  )
  assert.equal(fromGuid, 'twitter:status:99')
  assert.equal(fromLinkOnly, 'twitter:status:99')
  assert.equal(
    articleId('sub-1', fromGuid),
    articleId('sub-1', fromLinkOnly),
  )
})

test('resolveTwitterFeedTitle handles empty title and video-only posts', () => {
  assert.equal(
    resolveTwitterFeedTitle('', 'https://x.com/u/status/1', '<video src="a.mp4"></video>'),
    '[视频]',
  )
  assert.equal(
    resolveTwitterFeedTitle('hello', 'https://x.com/u/status/1', ''),
    'hello',
  )
})

test('parseFeedXml normalizes Twitter items and stores guid', async () => {
  const { items } = await parseFeedXml(TWITTER_RSS, stubSub)
  assert.equal(items.length, 2)
  assert.equal(items[0].guid, 'https://twitter.com/realDonaldTrump/status/2068431819603611979')
  assert.equal(items[0].title, 'RT Donald J. Trump: Re POLL…')
  assert.equal(items[1].title, '[视频]')
  assert.equal(
    articleId(stubSub.id, normalizeFeedItemDedupeKey(items[1].guid ?? '', items[1].link)),
    items[1].id,
  )
})
