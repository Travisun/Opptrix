import type Database from 'better-sqlite3'
import { searchFtsChunks } from './fts.js'
import { rrfFuse } from './rrf.js'
import type { EmbeddingService } from './embedding.js'
import type { VectorStore } from './vector-store.js'
import type { FtsSearchHit } from './types.js'

export async function searchHybridChunks(
  db: Database.Database,
  query: string,
  opts: {
    sessionId: string
    documentId?: string
    attachmentId?: string
    limit?: number
    embedding: EmbeddingService
    vectorStore: VectorStore
  },
): Promise<FtsSearchHit[]> {
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20)
  const ftsHits = searchFtsChunks(db, query, {
    sessionId: opts.sessionId,
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
  } else {
    documentIds = listSessionDocumentIds(db, opts.sessionId, opts.attachmentId)
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
    for (const row of hydrateChunks(db, opts.sessionId, missing)) {
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

function hydrateChunks(
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
