import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-news-grouped-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('getArticlesGrouped includes every subscription, not only timeline head', async () => {
  const { getNewsFeedStore } = await import('../packages/news-feed/dist/store.js')
  const { getArticlesGrouped } = await import('../packages/news-feed/dist/index.js')
  const { articleId } = await import('../packages/news-feed/dist/parser.js')

  const store = getNewsFeedStore()
  const now = Date.now()

  const hotSub = store.upsertSubscription({
    id: 'sub-hot',
    title: '快讯源',
    url: 'https://example.com/hot.xml',
    resolved_url: 'https://example.com/hot.xml',
    kind: 'rss',
    enabled: true,
    created_at: new Date().toISOString(),
  })

  const socialGroup = store.upsertGroup({ title: '社交' })

  const twitterSub = store.upsertSubscription({
    id: 'sub-twitter',
    title: 'Twitter @test',
    url: 'https://example.com/twitter/user/test',
    resolved_url: 'https://example.com/twitter/user/test',
    kind: 'rss',
    enabled: true,
    group_id: socialGroup.id,
    created_at: new Date().toISOString(),
  })

  const hotArticles = Array.from({ length: 120 }, (_, i) => ({
    id: articleId(hotSub.id, `hot-${i}`),
    subscription_id: hotSub.id,
    title: `快讯 ${i}`,
    link: `https://example.com/hot/${i}`,
    pub_date: new Date(now - i * 60_000).toISOString(),
    source_title: hotSub.title,
  }))

  const twitterArticles = Array.from({ length: 3 }, (_, i) => ({
    id: articleId(twitterSub.id, `twitter:status:${1000 + i}`),
    subscription_id: twitterSub.id,
    title: `推文 ${i}`,
    link: `https://x.com/test/status/${1000 + i}`,
    pub_date: new Date(now - 90 * 86_400_000 - i * 86_400_000).toISOString(),
    source_title: twitterSub.title,
  }))

  store.upsertArticlesForSubscription(hotSub.id, hotArticles)
  store.upsertArticlesForSubscription(twitterSub.id, twitterArticles)
  store.rebuildArticleIndex()

  const grouped = getArticlesGrouped()
  const twitterSource = grouped.by_source.find(s => s.subscription_id === twitterSub.id)
  assert.ok(twitterSource, 'Twitter subscription should appear in by_source')
  assert.equal(twitterSource.articles.length, 3)

  const socialSection = grouped.groups.find(g => g.id === socialGroup.id)
  assert.ok(socialSection, 'Group section should exist')
  assert.equal(socialSection.articles.length, 3)
})
