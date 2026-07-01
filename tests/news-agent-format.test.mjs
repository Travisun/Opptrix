import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-news-agent-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('compressNewsTextForAgent strips HTML and collapses whitespace', async () => {
  const { compressNewsTextForAgent } = await import('../packages/news-feed/dist/agent-format.js')
  const raw = '<p>第一行</p>\n\n<p>  第二行  </p>'
  assert.equal(compressNewsTextForAgent(raw), '第一行 第二行')
})

test('news hub tools list and fetch article detail', async () => {
  const { getNewsFeedStore } = await import('../packages/news-feed/dist/store.js')
  const { articleId } = await import('../packages/news-feed/dist/parser.js')
  const { newsCenterStatus, newsGroupsList, newsSourcesList, newsArticlesList, newsArticleDetail } =
    await import('../packages/research-hub/dist/news-hub.js')

  const store = getNewsFeedStore()
  const sub = store.upsertSubscription({
    title: '测试源',
    url: 'https://example.com/feed.xml',
    resolved_url: 'https://example.com/feed.xml',
    kind: 'rss',
    enabled: true,
  })
  const group = store.upsertGroup({ title: '宏观' })
  store.moveSubscriptionToGroup(sub.id, group.id)

  const article = {
    id: articleId(sub.id, 'news-agent-1'),
    subscription_id: sub.id,
    title: '测试要闻',
    link: 'https://example.com/a/1',
    pub_date: '2024-06-01T08:00:00.000Z',
    summary: '<p>摘要  段落</p>',
    content_html: '<p>正文\n\n第二段</p>',
    source_title: sub.title,
  }
  store.upsertArticlesForSubscription(sub.id, [article])
  store.rebuildArticleIndex()

  const t0 = Date.now()
  assert.equal(newsCenterStatus(t0).success, true)
  assert.equal(newsGroupsList(t0).data.groups.length, 1)
  assert.equal(newsSourcesList(t0).data.sources.length, 1)

  const timeline = newsArticlesList({ view: 'timeline', limit: 10 }, t0)
  assert.equal(timeline.success, true)
  assert.equal(timeline.data.articles[0].id, article.id)
  assert.ok(!timeline.data.articles[0].body_text)

  const byGroup = newsArticlesList({ view: 'group', group_id: group.id, limit: 10 }, t0)
  assert.equal(byGroup.data.articles.length, 1)

  const bySource = newsArticlesList({ view: 'source', subscription_id: sub.id, limit: 10 }, t0)
  assert.equal(bySource.data.articles.length, 1)

  const detail = newsArticleDetail({ article_id: article.id }, t0)
  assert.equal(detail.success, true)
  assert.equal(detail.data.body_text, '正文 第二段')
  assert.equal(detail.data.summary_text, '摘要 段落')
})
