import type Database from 'better-sqlite3'
import { searchFtsChunks } from './fts.js'
import { rrfFuse } from './rrf.js'
import type { EmbeddingService } from './embedding.js'
import type { VectorStore } from './vector-store.js'
import type { DocSearchScope, DocumentSourceType, FtsSearchHit } from './types.js'

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
  } else if (scope === 'library') {
    // library + 可选 source_type：预筛 documentIds，避免全表向量扫
    documentIds = listLibraryDocumentIds(db, opts.sourceType)
    if (!documentIds.length) return ftsHits
  }

  const vectorHits = await opts.vectorStore.search(queryVec, {
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

/** library 范围：ready 文档；可选按 source_type 预筛 */
function listLibraryDocumentIds(
  db: Database.Database,
  sourceType?: DocumentSourceType,
): string[] {
  if (sourceType) {
    const rows = db.prepare(`
      SELECT d.id AS document_id
      FROM documents d
      JOIN parse_artifacts pa ON pa.document_id = d.id
      WHERE pa.status = 'ready'
        AND COALESCE(d.source_type, 'report') = ?
    `).all(sourceType) as Array<{ document_id: string }>
    return rows.map(r => r.document_id)
  }
  const rows = db.prepare(`
    SELECT d.id AS document_id
    FROM documents d
    JOIN parse_artifacts pa ON pa.document_id = d.id
    WHERE pa.status = 'ready'
  `).all() as Array<{ document_id: string }>
  return rows.map(r => r.document_id)
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
