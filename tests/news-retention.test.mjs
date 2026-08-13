import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, utimes, rm, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  const dataDir = await mkdtemp(join(tmpdir(), 'opptrix-news-retention-page-'))
  const prevDir = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = dataDir

  try {
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
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

    const storeMod = await import('../packages/news-feed/dist/store.js')
    storeMod.resetNewsFeedStoreForTests?.()
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

test('applyNewsRetentionPolicy prunes without upsert and cascades news_enrichment delete', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'opptrix-news-retention-period-'))
  const prevDir = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = dataDir

  try {
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    try { getUserDataStore().close() } catch { /* first open */ }

    const userStore = getUserDataStore()
    const now = new Date()
    const recent = new Date(now)
    recent.setMonth(recent.getMonth() - 1)
    const old = new Date(now)
    old.setFullYear(old.getFullYear() - 5)

    for (const [id, pub] of [
      ['keep-1', recent.toISOString()],
      ['drop-1', old.toISOString()],
    ]) {
      userStore.setDocument('news_article', id, {
        id,
        subscription_id: 'sub-period',
        title: id,
        link: `https://example.com/${id}`,
        pub_date: pub,
        source_title: '源',
      })
      userStore.setDocument('news_enrichment', id, {
        article_id: id,
        status: 'done',
        updated_at: new Date().toISOString(),
      })
    }
    userStore.setDocument('news_index', 'main', {
      refreshed_at: null,
      subscription_meta: {},
      article_order: ['keep-1', 'drop-1'],
    })
    userStore.setDocument('preference', 'news_settings', normalizeNewsSettings({
      refresh_interval_min: 15,
      retention_years: 3,
      max_articles: null,
    }))

    const storeMod = await import('../packages/news-feed/dist/store.js')
    storeMod.resetNewsFeedStoreForTests()
    const deleted = []
    storeMod.setNewsArticleDeleteHook(id => {
      deleted.push(id)
      userStore.deleteDocument('news_enrichment', id)
    })

    // 无 upsert：仅周期调用
    storeMod.applyNewsRetentionPolicy()

    assert.deepEqual(userStore.listDocumentIds('news_article').sort(), ['keep-1'])
    assert.equal(userStore.getDocument('news_enrichment', 'drop-1'), null)
    assert.ok(userStore.getDocument('news_enrichment', 'keep-1'))
    assert.ok(deleted.includes('drop-1'))
  } finally {
    const storeMod = await import('../packages/news-feed/dist/store.js')
    storeMod.setNewsArticleDeleteHook(null)
    storeMod.resetNewsFeedStoreForTests()
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    try { getUserDataStore().close() } catch { /* ignore */ }
    if (prevDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDir
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('pruneMediaCache removes stale files and enforces maxBytes', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'opptrix-media-cache-'))
  const { pruneMediaCache } = await import('../packages/local-inference/dist/media-cache-prune.js')

  const now = Date.now()
  const oldPath = join(cacheDir, 'old.bin')
  const newPath = join(cacheDir, 'new.bin')
  const bigPath = join(cacheDir, 'big.bin')

  await writeFile(oldPath, Buffer.alloc(100, 1))
  await writeFile(newPath, Buffer.alloc(100, 2))
  await writeFile(bigPath, Buffer.alloc(500, 3))

  // old: 10 days ago; others: recent
  const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000)
  await utimes(oldPath, tenDaysAgo, tenDaysAgo)
  const recent = new Date(now - 60_000)
  await utimes(newPath, recent, recent)
  await utimes(bigPath, recent, recent)

  const ttlResult = await pruneMediaCache({
    cacheDir,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    maxBytes: 10_000,
    nowMs: now,
  })
  assert.equal(ttlResult.removedFiles, 1)
  assert.equal((await readdir(cacheDir)).includes('old.bin'), false)

  const capResult = await pruneMediaCache({
    cacheDir,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,
    maxBytes: 200,
    nowMs: now,
  })
  assert.ok(capResult.removedFiles >= 1)
  assert.ok(capResult.remainingBytes <= 200)

  const left = await readdir(cacheDir)
  for (const name of left) {
    const st = await stat(join(cacheDir, name))
    assert.ok(st.isFile())
  }

  await rm(cacheDir, { recursive: true, force: true })
})

test('ProviderHealthTracker.prune removes stale entries', async () => {
  const {
    getProviderHealthTracker,
    resetProviderHealthTracker,
    STALE_THRESHOLD_MS,
  } = await import('../packages/a-stock-layer/dist/core/provider-health.js')

  resetProviderHealthTracker()
  const tracker = getProviderHealthTracker()
  tracker.recordSuccess('p1', 'realtime')
  tracker.recordFailure('p2', 'kline', 'timeout')

  const h1 = tracker.getHealth('p1', 'realtime')
  const h2 = tracker.getHealth('p2', 'kline')
  assert.ok(h1)
  assert.ok(h2)

  // 人为拉旧（getHealth 返回 store 内引用）
  h1.lastSuccessAt = Date.now() - STALE_THRESHOLD_MS - 1_000
  h2.lastFailAt = Date.now() - STALE_THRESHOLD_MS - 1_000

  const removed = tracker.prune()
  assert.equal(removed, 2)
  assert.deepEqual(tracker.getAll(), {})
  resetProviderHealthTracker()
})
