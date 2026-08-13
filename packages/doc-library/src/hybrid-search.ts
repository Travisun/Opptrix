import type Database from 'better-sqlite3'
import { searchFtsChunks } from './fts.js'
import { rrfFuse } from './rrf.js'
import type { EmbeddingService } from './embedding.js'
import type { VectorStore, VectorSearchHit } from './vector-store.js'
import type { DocSearchScope, DocumentSourceType, FtsSearchHit } from './types.js'

/** library 文档 id 分页大小 — 向量预筛按页聚合，避免一次加载全库 id */
export const LIBRARY_DOCUMENT_ID_PAGE_SIZE = 256

export interface HybridSearchChunksOpts {
  sessionId: string
  scope?: DocSearchScope
  sourceType?: DocumentSourceType
  documentId?: string
  attachmentId?: string
  limit?: number
  embedding: EmbeddingService
  vectorStore: VectorStore
}

export async function searchHybridChunks(
  db: Database.Database,
  query: string,
  opts: HybridSearchChunksOpts,
): Promise<FtsSearchHit[]> {
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20)
  const scope = opts.scope ?? 'session'
  const ftsHits = searchFtsChunks(db, query, {
    sessionId: opts.sessionId,
    scope,
    sourceType: opts.sourceType,
    documentId: opts.documentId,
    attachmentId: opts.attachmentId,
    limit,
  })

  // 资讯不进 Lance：source_type=news 时仅关键词 FTS
  if (opts.sourceType === 'news') {
    return ftsHits
  }

  const embeddingReady = opts.embedding.isReady()
    || await opts.embedding.tryEnableDefaultBackend()
  if (!embeddingReady) {
    return ftsHits
  }

  const vectorOk = await opts.vectorStore.isAvailable()
  if (!vectorOk) {
    return ftsHits
  }

  const queryVec = await opts.embedding.embedQuery(query)
  if (!queryVec) {
    return ftsHits
  }

  let documentIds: string[] | undefined
  if (opts.documentId) {
    documentIds = [opts.documentId]
  } else if (scope === 'session') {
    documentIds = listSessionDocumentIds(db, opts.sessionId, opts.attachmentId)
    if (!documentIds.length) return ftsHits
  }

  const vectorHits = scope === 'library' && !opts.documentId
    ? await searchLibraryVectorsPaged(db, queryVec, opts.vectorStore, limit, opts.sourceType)
    : await opts.vectorStore.search(queryVec, {
      documentIds,
      limit,
    })

  if (!vectorHits.length) {
    return ftsHits
  }

  const fusedIds = rrfFuse(
    [
      ftsHits.map(h => ({ chunk_id: h.chunk_id })),
      vectorHits.map(h => ({ chunk_id: h.chunk_id })),
    ],
    { limit },
  )

  const byId = new Map<string, FtsSearchHit>()
  for (const h of ftsHits) byId.set(h.chunk_id, h)

  // 向量命中但 FTS 未覆盖时，从 SQLite 补全元数据
  const missing = fusedIds.filter(id => !byId.has(id))
  if (missing.length) {
    const hydrated = scope === 'library'
      ? hydrateLibraryChunks(db, missing, opts.sourceType)
      : hydrateSessionChunks(db, opts.sessionId, missing)
    for (const row of hydrated) {
      byId.set(row.chunk_id, row)
    }
  }

  const out: FtsSearchHit[] = []
  fusedIds.forEach((id, idx) => {
    const hit = byId.get(id)
    if (!hit) return
    out.push({ ...hit, rank: -(idx + 1) })
  })
  return out.length ? out : ftsHits
}

function listSessionDocumentIds(
  db: Database.Database,
  sessionId: string,
  attachmentId?: string,
): string[] {
  if (attachmentId) {
    const rows = db.prepare(`
      SELECT document_id FROM session_documents
      WHERE session_id = ? AND attachment_id = ?
    `).all(sessionId, attachmentId) as Array<{ document_id: string }>
    return rows.map(r => r.document_id)
  }
  const rows = db.prepare(`
    SELECT document_id FROM session_documents WHERE session_id = ?
  `).all(sessionId) as Array<{ document_id: string }>
  return rows.map(r => r.document_id)
}

/** library 范围：ready 文档；可选按 source_type 预筛；向量路径排除 news */
export function listLibraryDocumentIds(
  db: Database.Database,
  sourceType?: DocumentSourceType,
): string[] {
  const out: string[] = []
  for (const page of iterateLibraryDocumentIdPages(db, sourceType)) {
    out.push(...page)
  }
  return out
}

/**
 * 分页列举 library ready 文档 id（排除 news，除非显式 sourceType）。
 * 供向量预筛按页聚合，避免无界数组。
 */
export function* iterateLibraryDocumentIdPages(
  db: Database.Database,
  sourceType?: DocumentSourceType,
  pageSize = LIBRARY_DOCUMENT_ID_PAGE_SIZE,
): Generator<string[]> {
  if (sourceType === 'news') return

  const limit = Math.min(Math.max(pageSize, 1), 2000)
  let afterId: string | undefined

  for (;;) {
    const page = listLibraryDocumentIdPage(db, { sourceType, limit, afterId })
    if (!page.length) return
    yield page
    afterId = page[page.length - 1]
    if (page.length < limit) return
  }
}

function listLibraryDocumentIdPage(
  db: Database.Database,
  opts: {
    sourceType?: DocumentSourceType
    limit: number
    afterId?: string
  },
): string[] {
  const { sourceType, limit, afterId } = opts
  if (sourceType === 'news') return []

  if (sourceType) {
    const rows = afterId
      ? db.prepare(`
          SELECT d.id AS document_id
          FROM documents d
          JOIN parse_artifacts pa ON pa.document_id = d.id
          WHERE pa.status = 'ready'
            AND COALESCE(d.source_type, 'report') = ?
            AND d.id > ?
          ORDER BY d.id ASC
          LIMIT ?
        `).all(sourceType, afterId, limit) as Array<{ document_id: string }>
      : db.prepare(`
          SELECT d.id AS document_id
          FROM documents d
          JOIN parse_artifacts pa ON pa.document_id = d.id
          WHERE pa.status = 'ready'
            AND COALESCE(d.source_type, 'report') = ?
          ORDER BY d.id ASC
          LIMIT ?
        `).all(sourceType, limit) as Array<{ document_id: string }>
    return rows.map(r => r.document_id)
  }

  const rows = afterId
    ? db.prepare(`
        SELECT d.id AS document_id
        FROM documents d
        JOIN parse_artifacts pa ON pa.document_id = d.id
        WHERE pa.status = 'ready'
          AND COALESCE(d.source_type, 'report') != 'news'
          AND d.id > ?
        ORDER BY d.id ASC
        LIMIT ?
      `).all(afterId, limit) as Array<{ document_id: string }>
    : db.prepare(`
        SELECT d.id AS document_id
        FROM documents d
        JOIN parse_artifacts pa ON pa.document_id = d.id
        WHERE pa.status = 'ready'
          AND COALESCE(d.source_type, 'report') != 'news'
        ORDER BY d.id ASC
        LIMIT ?
      `).all(limit) as Array<{ document_id: string }>
  return rows.map(r => r.document_id)
}

/**
 * 按页取 library documentIds，分别向量检索后合并全局 top-K。
 * 每页 top-K ∪ 再取 top-K ≡ 全量候选上的 top-K（精确相似度成立）。
 */
async function searchLibraryVectorsPaged(
  db: Database.Database,
  queryVec: number[],
  vectorStore: VectorStore,
  limit: number,
  sourceType?: DocumentSourceType,
): Promise<VectorSearchHit[]> {
  const merged = new Map<string, VectorSearchHit>()
  let anyPage = false

  for (const page of iterateLibraryDocumentIdPages(db, sourceType)) {
    anyPage = true
    const hits = await vectorStore.search(queryVec, { documentIds: page, limit })
    for (const h of hits) {
      const prev = merged.get(h.chunk_id)
      if (!prev || h.score > prev.score) merged.set(h.chunk_id, h)
    }
  }

  if (!anyPage) return []

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function hydrateSessionChunks(
  db: Database.Database,
  sessionId: string,
  chunkIds: string[],
): FtsSearchHit[] {
  if (!chunkIds.length) return []
  const placeholders = chunkIds.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT
      c.id AS chunk_id,
      c.document_id,
      sd.attachment_id,
      c.page,
      substr(c.text, 1, 160) AS excerpt
    FROM chunks c
    JOIN session_documents sd ON sd.document_id = c.document_id
    WHERE sd.session_id = ?
      AND c.id IN (${placeholders})
  `).all(sessionId, ...chunkIds) as Array<{
    chunk_id: string
    document_id: string
    attachment_id: string | null
    page: number
    excerpt: string
  }>

  return rows.map(r => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    attachment_id: r.attachment_id,
    page: r.page,
    excerpt: r.excerpt,
    rank: 0,
  }))
}

function hydrateLibraryChunks(
  db: Database.Database,
  chunkIds: string[],
  sourceType?: DocumentSourceType,
): FtsSearchHit[] {
  if (!chunkIds.length) return []
  const placeholders = chunkIds.map(() => '?').join(', ')
  const clauses = [
    `c.id IN (${placeholders})`,
    "pa.status = 'ready'",
  ]
  const params: Array<string | number> = [...chunkIds]
  if (sourceType) {
    clauses.push("COALESCE(d.source_type, 'report') = ?")
    params.push(sourceType)
  }

  const rows = db.prepare(`
    SELECT
      c.id AS chunk_id,
      c.document_id,
      NULL AS attachment_id,
      c.page,
      substr(c.text, 1, 160) AS excerpt
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    JOIN parse_artifacts pa ON pa.document_id = c.document_id
    WHERE ${clauses.join(' AND ')}
  `).all(...params) as Array<{
    chunk_id: string
    document_id: string
    attachment_id: string | null
    page: number
    excerpt: string
  }>

  return rows.map(r => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    attachment_id: r.attachment_id,
    page: r.page,
    excerpt: r.excerpt,
    rank: 0,
  }))
}
