import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-news-twitter-dedupe-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('Twitter status duplicates collapse to canonical id per subscription', async () => {
  const { articleId } = await import('../packages/news-feed/dist/parser.js')
  const { buildTwitterStatusDedupeKey } = await import('../packages/news-feed/dist/twitter-guid.js')
  const { articleContentDedupeKey } = await import('../packages/news-feed/dist/dedupe.js')
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')

  const userStore = getUserDataStore()
  const subId = 'sub-twitter-legacy'
  const statusId = '1999888777666'
  const canonicalId = articleId(subId, buildTwitterStatusDedupeKey(statusId))
  const legacyGuidId = articleId(subId, `https://twitter.com/test/status/${statusId}`)
  const legacyLinkId = articleId(subId, `https://x.com/test/status/${statusId}`)

  const base = {
    subscription_id: subId,
    title: '同一条推文',
    link: `https://x.com/test/status/${statusId}`,
    pub_date: '2024-06-01T08:00:00.000Z',
    source_title: 'Twitter @test',
  }

  userStore.setDocument('preference', 'news_subscriptions', [{
    id: subId,
    title: 'Twitter @test',
    url: 'https://example.com/twitter/user/test',
    resolved_url: 'https://example.com/twitter/user/test',
    kind: 'rss',
    enabled: true,
    created_at: '2024-01-01T00:00:00.000Z',
  }])
  userStore.setDocument('news_article', legacyGuidId, {
    ...base,
    id: legacyGuidId,
    guid: `https://twitter.com/test/status/${statusId}`,
  })
  userStore.setDocument('news_article', legacyLinkId, {
    ...base,
    id: legacyLinkId,
    guid: '',
  })
  userStore.setDocument('news_index', 'main', {
    refreshed_at: null,
    subscription_meta: {},
    article_order: [legacyGuidId, legacyLinkId],
  })

  const { getNewsFeedStore } = await import('../packages/news-feed/dist/store.js')
  const store = getNewsFeedStore()

  const listed = store.listArticlesBySubscription(subId, 50)
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, canonicalId)

  const key = articleContentDedupeKey(listed[0])
  assert.equal(key, buildTwitterStatusDedupeKey(statusId))
  assert.equal(store.getArticle(legacyGuidId), undefined)
  assert.equal(store.getArticle(legacyLinkId), undefined)
})

test('upsert removes stale Twitter rows when refreshing canonical item', async () => {
  const { getNewsFeedStore } = await import('../packages/news-feed/dist/store.js')
  const { articleId } = await import('../packages/news-feed/dist/parser.js')
  const { buildTwitterStatusDedupeKey } = await import('../packages/news-feed/dist/twitter-guid.js')

  const store = getNewsFeedStore()
  const sub = store.upsertSubscription({
    title: 'Twitter @refresh',
    url: 'https://example.com/twitter/user/refresh',
    resolved_url: 'https://example.com/twitter/user/refresh',
    kind: 'rss',
    enabled: true,
  })

  const statusId = '1888777666555'
  const legacyId = articleId(sub.id, `https://twitter.com/refresh/status/${statusId}`)
  const canonicalId = articleId(sub.id, buildTwitterStatusDedupeKey(statusId))

  store.upsertArticlesForSubscription(sub.id, [{
    id: legacyId,
    subscription_id: sub.id,
    guid: `https://twitter.com/refresh/status/${statusId}`,
    title: '旧记录',
    link: `https://x.com/refresh/status/${statusId}`,
    pub_date: '2024-06-02T08:00:00.000Z',
    source_title: sub.title,
  }])

  store.upsertArticlesForSubscription(sub.id, [{
    id: canonicalId,
    subscription_id: sub.id,
    guid: `https://x.com/refresh/status/${statusId}`,
    title: '新记录',
    link: `https://x.com/refresh/status/${statusId}`,
    pub_date: '2024-06-02T09:00:00.000Z',
    source_title: sub.title,
  }])

  const listed = store.listArticlesBySubscription(sub.id, 50)
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, canonicalId)
  assert.equal(listed[0].title, '新记录')
})
