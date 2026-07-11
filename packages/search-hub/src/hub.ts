import type { ResearchHub } from '@opptrix/research-hub'
import type { SessionMeta, SessionRecord } from '@opptrix/agent'
import { SessionStore } from '@opptrix/agent'
import { getEnrichmentStore } from '@opptrix/article-enrichment'
import { NewsFeedStore } from '@opptrix/news-feed'
import { getUserDataStore } from '@opptrix/user-store'
import { buildInstrumentNamespace, inferCnAssetClassFromSymbol } from '@opptrix/shared'
import type { CnExchange } from '@opptrix/shared'
import { rebuildNewsSearchIndex } from './news-index.js'
import { rebuildSessionSearchIndex } from './session-index.js'

export type SearchResultKind = 'session' | 'stock' | 'news'

export interface SessionSearchHit {
  kind: 'session'
  id: string
  title: string
  snippet: string
  archived: boolean
  archiveFolderId?: string | null
  updatedAt: string
}

export interface StockSearchHit {
  kind: 'stock'
  code: string
  name: string
  industry: string
  market: string
}

export interface NewsSearchHit {
  kind: 'news'
  id: string
  title: string
  snippet: string
  pubDate: string
  sourceTitle: string
}

export type SearchHit = SessionSearchHit | StockSearchHit | NewsSearchHit

export interface UnifiedSearchResult {
  query: string
  sessions: SessionSearchHit[]
  stocks: StockSearchHit[]
  news: NewsSearchHit[]
}

const INDEX_FLAG = 'search_index_v1'

export class SearchHub {
  constructor(
    private hub: ResearchHub,
    private sessions = new SessionStore(),
  ) {}

  ensureIndexes() {
    const store = getUserDataStore()
    if (store.getMetaFlag(INDEX_FLAG)) return

    const allSessions = store.listDocuments<SessionRecord>('session')
    rebuildSessionSearchIndex(allSessions)

    const newsStore = new NewsFeedStore()
    const articleIds = newsStore.listArticleIds()
    const articles = articleIds
      .map(id => newsStore.getArticle(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
    const enrichmentStore = getEnrichmentStore()
    const enrichmentMap = new Map<string, import('@opptrix/news-feed').ArticleEnrichment>()
    for (const id of articleIds) {
      const doc = enrichmentStore.get(id)
      if (doc) enrichmentMap.set(id, doc)
    }
    rebuildNewsSearchIndex(articles, enrichmentMap)

    store.setMetaFlag(INDEX_FLAG)
  }

  search(query: string, limit = 20): UnifiedSearchResult {
    this.ensureIndexes()
    const q = query.trim()
    const cap = Math.min(Math.max(limit, 1), 50)
    const store = getUserDataStore()

    const sessionRows = q.length >= 1
      ? store.searchSessions(q, { limit: cap, includeArchived: true })
      : []

    const sessionMeta = new Map(
      this.sessions.listAll().map(s => [s.id, s] as const),
    )

    const sessions: SessionSearchHit[] = sessionRows.map(row => {
      const meta = sessionMeta.get(row.session_id)
      return {
        kind: 'session',
        id: row.session_id,
        title: meta?.title ?? row.title,
        snippet: row.snippet.replace(/<\/?b>/g, ''),
        archived: Boolean(meta?.archivedAt),
        archiveFolderId: meta?.archiveFolderId ?? null,
        updatedAt: meta?.updatedAt ?? '',
      }
    })

    const stocks: StockSearchHit[] = q.length >= 2
      ? this.hub.marketData.searchStocks(q, cap).map(s => {
        const exchange = (s.market?.trim().toUpperCase() || 'SH') as CnExchange
        const instrument = {
          market: 'CN' as const,
          assetClass: inferCnAssetClassFromSymbol(s.code, exchange),
          symbol: s.code,
          exchange,
        }
        return {
          kind: 'stock' as const,
          code: buildInstrumentNamespace(instrument),
          name: s.name,
          industry: s.industry,
          market: s.market,
        }
      })
      : []

    const newsRows = q.length >= 1 ? store.searchNews(q, cap) : []
    const news: NewsSearchHit[] = newsRows.map(row => ({
      kind: 'news',
      id: row.article_id,
      title: row.title,
      snippet: row.snippet.replace(/<\/?b>/g, ''),
      pubDate: row.pub_date,
      sourceTitle: row.source_title,
    }))

    return { query: q, sessions, stocks, news }
  }

  listRecentSessions(limit = 12): SessionMeta[] {
    return this.sessions.listActive().slice(0, limit)
  }

  listArchivedByFolder(): Array<{ folderId: string; title: string; sessions: SessionMeta[] }> {
    const grouped = this.sessions.listArchivedGrouped()
    return grouped.map(g => ({
      folderId: g.folder.id,
      title: g.folder.title,
      sessions: g.sessions,
    }))
  }
}
