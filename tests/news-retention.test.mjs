import assert from 'node:assert/strict'
import test from 'node:test'
import { selectRetainedArticles, normalizeNewsSettings } from '../packages/news-feed/dist/retention.js'

function article(id, pubDate) {
  return {
    id,
    subscription_id: 'sub-1',
    title: id,
    link: `https://example.com/${id}`,
    pub_date: pubDate,
    source_title: '源',
  }
}

test('normalizeNewsSettings defaults to 3 years and unlimited count', () => {
  const s = normalizeNewsSettings({ refresh_interval_min: 15 })
  assert.equal(s.retention_years, 3)
  assert.equal(s.max_articles, null)
  assert.equal(s.translation.service_mode, 'remote')
  assert.equal(s.translation.offline_model, '__auto__')
  assert.equal(s.enrichment.enabled, false)
  assert.equal(s.enrichment.processing_mode, 'on_demand')
  assert.equal(s.enrichment.service_mode, 'remote')
})

test('selectRetainedArticles drops articles older than retention years', () => {
  const now = new Date()
  const recent = new Date(now)
  recent.setMonth(recent.getMonth() - 1)
  const old = new Date(now)
  old.setFullYear(old.getFullYear() - 4)

  const kept = selectRetainedArticles([
    article('new', recent.toISOString()),
    article('old', old.toISOString()),
  ], normalizeNewsSettings({ refresh_interval_min: 15, retention_years: 3, max_articles: null }))

  assert.equal(kept.length, 1)
  assert.equal(kept[0].id, 'new')
})

test('selectRetainedArticles enforces max count by pub_date', () => {
  const kept = selectRetainedArticles([
    article('a', '2024-06-01T00:00:00.000Z'),
    article('b', '2024-05-01T00:00:00.000Z'),
    article('c', '2024-04-01T00:00:00.000Z'),
  ], normalizeNewsSettings({ refresh_interval_min: 15, retention_years: 0, max_articles: 2 }))

  assert.deepEqual(kept.map(a => a.id), ['a', 'b'])
})

test('retention_years 0 keeps all when no max', () => {
  const kept = selectRetainedArticles([
    article('a', '2010-01-01T00:00:00.000Z'),
    article('b', '2024-01-01T00:00:00.000Z'),
  ], normalizeNewsSettings({ refresh_interval_min: 15, retention_years: 0, max_articles: null }))
  assert.equal(kept.length, 2)
})

test('applyRetentionPolicy enforces max_articles via paged extract (no full-body listDocuments)', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dataDir = await mkdtemp(join(tmpdir(), 'opptrix-news-retention-page-'))
  const prevDir = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = dataDir

  try {
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    // 确保单例指向临时目录
    try { getUserDataStore().close() } catch { /* first open */ }

    const userStore = getUserDataStore()
    let extractPages = 0
    const origExtract = userStore.listDocumentExtractPage.bind(userStore)
    userStore.listDocumentExtractPage = (...args) => {
      extractPages += 1
      return origExtract(...args)
    }
    let fullListCalls = 0
    const origList = userStore.listDocuments.bind(userStore)
    userStore.listDocuments = (...args) => {
      fullListCalls += 1
      return origList(...args)
    }

    const total = 25
    const maxKeep = 5
    for (let i = 0; i < total; i++) {
      const id = `art-${String(i).padStart(3, '0')}`
      const day = String((i % 28) + 1).padStart(2, '0')
      userStore.setDocument('news_article', id, {
        id,
        subscription_id: 'sub-ret',
        title: `t-${i}`,
        link: `https://example.com/${id}`,
        pub_date: `2024-06-${day}T12:00:00.000Z`,
        content_html: `<p>${'x'.repeat(2000)}</p>`,
        source_title: '源',
      })
    }
    userStore.setDocument('news_index', 'main', {
      refreshed_at: null,
      subscription_meta: {},
      article_order: [],
    })
    userStore.setDocument('preference', 'news_settings', normalizeNewsSettings({
      refresh_interval_min: 15,
      retention_years: 0,
      max_articles: maxKeep,
    }))

    const { getNewsFeedStore } = await import('../packages/news-feed/dist/store.js')
    // 重置 news store 单例（模块可能已缓存）
    const storeMod = await import('../packages/news-feed/dist/store.js')
    const store = storeMod.getNewsFeedStore()
    store.saveSettings(normalizeNewsSettings({
      refresh_interval_min: 15,
      retention_years: 0,
      max_articles: maxKeep,
    }))

    const remaining = userStore.listDocumentIds('news_article')
    assert.equal(remaining.length, maxKeep)
    assert.ok(extractPages >= 1, '应走 listDocumentExtractPage 分页')
    assert.equal(fullListCalls, 0, 'retention 路径不应调用 listDocuments 全量 parse')

    const order = store.listArticleIds()
    assert.equal(order.length, maxKeep)
  } finally {
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    try { getUserDataStore().close() } catch { /* ignore */ }
    if (prevDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDir
    await rm(dataDir, { recursive: true, force: true })
  }
})
