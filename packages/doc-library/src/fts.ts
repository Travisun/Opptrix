import type Database from 'better-sqlite3'
import type { ChunkRow, DocSearchScope, DocumentSourceType } from './types.js'

export function ftsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/[\s,，、;；]+/)
    .map(t => t.replace(/["'*]/g, '').trim())
    .filter(t => t.length >= 1)
  if (!tokens.length) return ''
  return tokens.map(t => `"${t}"*`).join(' ')
}

export function replaceFtsForDocument(db: Database.Database, documentId: string, chunks: ChunkRow[]): void {
  db.prepare('DELETE FROM fts_chunks WHERE document_id = ?').run(documentId)
  const insert = db.prepare(`
    INSERT INTO fts_chunks(chunk_id, document_id, text) VALUES(?, ?, ?)
  `)
  const tx = db.transaction((rows: ChunkRow[]) => {
    for (const row of rows) {
      insert.run(row.id, row.document_id, row.text)
    }
  })
  tx(chunks)
}

export interface FtsSearchRow {
  chunk_id: string
  document_id: string
  attachment_id: string | null
  page: number
  excerpt: string
  rank: number
}

export interface FtsSearchChunksOpts {
  sessionId: string
  scope?: DocSearchScope
  sourceType?: DocumentSourceType
  documentId?: string
  attachmentId?: string
  limit?: number
}

export function searchFtsChunks(
  db: Database.Database,
  query: string,
  opts: FtsSearchChunksOpts,
): FtsSearchRow[] {
  const q = ftsQuery(query)
  if (!q) return []
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20)
  const scope = opts.scope ?? 'session'

  if (scope === 'library') {
    return searchFtsChunksLibrary(db, q, limit, opts)
  }
  return searchFtsChunksSession(db, q, limit, opts)
}

function searchFtsChunksSession(
  db: Database.Database,
  q: string,
  limit: number,
  opts: FtsSearchChunksOpts,
): FtsSearchRow[] {
  const clauses: string[] = ['sd.session_id = ?', 'fts_chunks MATCH ?']
  const params: Array<string | number> = [opts.sessionId, q]

  if (opts.documentId) {
    clauses.push('c.document_id = ?')
    params.push(opts.documentId)
  }
  if (opts.attachmentId) {
    clauses.push('sd.attachment_id = ?')
    params.push(opts.attachmentId)
  }

  params.push(limit)

  try {
    return db.prepare(`
      SELECT
        c.id AS chunk_id,
        c.document_id,
        sd.attachment_id,
        c.page,
        snippet(fts_chunks, 2, '', '', '…', 48) AS excerpt,
        rank
      FROM fts_chunks
      JOIN chunks c ON c.id = fts_chunks.chunk_id
      JOIN session_documents sd ON sd.document_id = c.document_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY rank
      LIMIT ?
    `).all(...params) as FtsSearchRow[]
  } catch {
    return []
  }
}

function searchFtsChunksLibrary(
  db: Database.Database,
  q: string,
  limit: number,
  opts: FtsSearchChunksOpts,
): FtsSearchRow[] {
  const clauses: string[] = [
    'fts_chunks MATCH ?',
    "pa.status = 'ready'",
  ]
  const params: Array<string | number> = [q]

  if (opts.documentId) {
    clauses.push('c.document_id = ?')
    params.push(opts.documentId)
  }
  if (opts.sourceType) {
    clauses.push("COALESCE(d.source_type, 'report') = ?")
    params.push(opts.sourceType)
  }

  params.push(limit)

  try {
    return db.prepare(`
      SELECT
        c.id AS chunk_id,
        c.document_id,
        NULL AS attachment_id,
        c.page,
        snippet(fts_chunks, 2, '', '', '…', 48) AS excerpt,
        rank
      FROM fts_chunks
      JOIN chunks c ON c.id = fts_chunks.chunk_id
      JOIN documents d ON d.id = c.document_id
      JOIN parse_artifacts pa ON pa.document_id = c.document_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY rank
      LIMIT ?
    `).all(...params) as FtsSearchRow[]
  } catch {
    return []
  }
}
