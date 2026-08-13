/**
 * #11 资讯双 FTS 收敛：
 * - 新资讯不再写入 doc-library chunks
 * - user-store / SearchHub 资讯 FTS 仍可用
 * - Agent search_library(source_type=news) 走 user-store
 * - 研报仍走 doc-library
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

let dataDir = ''

describe('news FTS converge (single index)', { concurrency: false }, () => {
  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'opptrix-news-fts-'))
    process.env.OPPTRIX_DATA_DIR = dataDir
    // 必须在 getDocLibraryService 之前注入，避免单例字段绑定 Lance 原生库
    const { MemoryVectorStore, setVectorStoreForTests, setEmbeddingServiceForTests, EmbeddingService, MockEmbeddingBackend } =
      await import('../packages/doc-library/dist/index.js')
    setVectorStoreForTests(new MemoryVectorStore())
    setEmbeddingServiceForTests(new EmbeddingService(new MockEmbeddingBackend(false)))
  })

  after(async () => {
    try {
      const {
        closeDocLibraryService,
        setVectorStoreForTests,
        setEmbeddingServiceForTests,
      } = await import('../packages/doc-library/dist/index.js')
      await closeDocLibraryService()
      setVectorStoreForTests(null)
      setEmbeddingServiceForTests(null)
    } catch { /* ignore */ }
    try {
      const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
      getUserDataStore().close()
    } catch { /* ignore */ }
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true }).catch(() => {})
    }
    delete process.env.OPPTRIX_DATA_DIR
  })

  it('ingestNewsArticleToDocLibrary is no-op (no doc-library news docs)', async () => {
    const {
      ingestNewsArticleToDocLibrary,
      newsDocIngestQueueDepthForTests,
    } = await import('../apps/server/dist/news-doc-ingest.js')
    const { getDocLibraryService } = await import('../packages/doc-library/dist/index.js')

    const article = {
      id: 'fts-conv-art-1',
      subscription_id: 'sub-1',
      title: '贵州茅台机构调研 UNIQUEFTSCONV991',
      link: 'https://example.com/1',
      pub_date: '2026-08-13T00:00:00.000Z',
      summary: '内容足够长用于校验入库与检索 UNIQUEFTSCONV991 关键词。',
      content_html: '<p>正文 UNIQUEFTSCONV991 足够长用于校验。</p>',
      source_title: '测试源',
    }

    ingestNewsArticleToDocLibrary(article)
    assert.equal(newsDocIngestQueueDepthForTests(), 0)

    const svc = getDocLibraryService()
    const byExternal = svc.getRepository().findDocumentByExternalId('news', article.id)
    assert.equal(byExternal, null, 'no-op 后不得产生 source_type=news 文档')
  })

  it('SearchHub + search_library news hits user-store FTS; report still library', async () => {
    const { syncNewsSearchIndex } = await import('../packages/search-hub/dist/news-index.js')
    const { SearchHub } = await import('../packages/search-hub/dist/hub.js')
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    const { buildDocumentTools } = await import('../packages/agent/dist/document-tools.js')
    const { getDocLibraryService } = await import('../packages/doc-library/dist/index.js')

    const article = {
      id: 'fts-conv-art-2',
      subscription_id: 'sub-1',
      title: '宁德时代产能扩张 UNIQUEAGENTNEWS772',
      link: 'https://example.com/2',
      pub_date: '2026-08-13T00:00:00.000Z',
      summary: '电池龙头 UNIQUEAGENTNEWS772 宣布扩产计划，内容足够长。',
      content_html: '<p>UNIQUEAGENTNEWS772 扩产细节。</p>',
      source_title: '测试源',
    }

    getUserDataStore().setDocument('news_article', article.id, article)
    syncNewsSearchIndex(article)

    const stubHub = { marketData: { searchStocks: () => [] } }
    const searchHub = new SearchHub(/** @type {any} */ (stubHub))
    const unified = searchHub.search('UNIQUEAGENTNEWS772', 10)
    assert.ok(unified.news.some(n => n.id === article.id), 'SearchHub 须命中资讯 FTS')

    const svc = getDocLibraryService()
    const report = svc.ingestFromText({
      text: '研报正文提到 UNIQUEAGENTREPORT553 评级上调，内容足够长用于入库校验。',
      name: '测试研报 UNIQUEAGENTREPORT553',
      sourceType: 'report',
      externalId: 'report-ext-fts-conv-1',
    })
    assert.ok(report)
    assert.equal(report.parseStatus, 'ready')
    assert.equal(svc.getRepository().getParseArtifact(report.documentId)?.status, 'ready')

    const tools = buildDocumentTools()
    const searchLibrary = tools.find(t => t.name === 'search_library')
    assert.ok(searchLibrary)

    const newsResult = await searchLibrary.handler({
      query: 'UNIQUEAGENTNEWS772',
      source_type: 'news',
      limit: 8,
    })
    assert.ok(!('error' in newsResult), JSON.stringify(newsResult))
    assert.equal(newsResult.source, 'news_fts')
    assert.ok(
      newsResult.hits.some(
        h => h.document_id === article.id && String(h.excerpt).includes('UNIQUEAGENTNEWS772'),
      ),
      'search_library news 须命中 user-store FTS',
    )
    assert.equal(
      svc.getRepository().findDocumentByExternalId('news', article.id),
      null,
      '未双写的资讯不得出现在 doc-library',
    )

    const reportResult = await searchLibrary.handler({
      query: 'UNIQUEAGENTREPORT553',
      source_type: 'report',
      limit: 8,
    })
    assert.ok(!('error' in reportResult), JSON.stringify(reportResult))
    assert.equal(reportResult.source, 'library')
    assert.ok(
      reportResult.hits.some(h => h.document_id === report.documentId),
      '研报仍须经 doc-library 命中',
    )
  })
})
