import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type {
  ChunkRow,
  DocumentKind,
  DocumentRow,
  ParseArtifactRow,
  ParseChunkInput,
  ParseEngineId,
  ParseStatus,
  SessionDocumentRow,
} from './types.js'
import { blobPathForSha, markdownPathForDocument } from './paths.js'
import { replaceFtsForDocument } from './fts.js'

export class DocLibraryRepository {
  constructor(private readonly db: Database.Database) {}

  findDocumentBySha(contentSha256: string): DocumentRow | null {
    const row = this.db.prepare(`
      SELECT id, content_sha256, name, mime, kind, byte_size, blob_path,
             COALESCE(source_type, 'report') AS source_type, external_id,
             created_at, updated_at
      FROM documents WHERE content_sha256 = ?
    `).get(contentSha256) as DocumentRow | undefined
    return row ?? null
  }

  findDocumentByExternalId(
    sourceType: DocumentRow['source_type'] | string,
    externalId: string,
  ): DocumentRow | null {
    if (!externalId) return null
    const row = this.db.prepare(`
      SELECT id, content_sha256, name, mime, kind, byte_size, blob_path,
             COALESCE(source_type, 'report') AS source_type, external_id,
             created_at, updated_at
      FROM documents
      WHERE COALESCE(source_type, 'report') = ? AND external_id = ?
      LIMIT 1
    `).get(sourceType, externalId) as DocumentRow | undefined
    return row ?? null
  }

  getDocument(documentId: string): DocumentRow | null {
    const row = this.db.prepare(`
      SELECT id, content_sha256, name, mime, kind, byte_size, blob_path,
             COALESCE(source_type, 'report') AS source_type, external_id,
             created_at, updated_at
      FROM documents WHERE id = ?
    `).get(documentId) as DocumentRow | undefined
    return row ?? null
  }

  insertDocument(row: Omit<DocumentRow, 'created_at' | 'updated_at' | 'source_type' | 'external_id'> & {
    created_at?: string
    updated_at?: string
    source_type?: DocumentRow['source_type']
    external_id?: string | null
  }): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO documents(
        id, content_sha256, name, mime, kind, byte_size, blob_path,
        source_type, external_id, created_at, updated_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.content_sha256,
      row.name,
      row.mime,
      row.kind,
      row.byte_size,
      row.blob_path,
      row.source_type ?? 'report',
      row.external_id ?? null,
      row.created_at ?? now,
      row.updated_at ?? now,
    )
  }

  /** 更新资讯等正文变更：sha / 名 / blob / external 元数据 */
  updateDocumentContent(
    documentId: string,
    patch: {
      content_sha256: string
      name: string
      mime: string
      kind: DocumentKind
      byte_size: number
      blob_path: string
      source_type?: DocumentRow['source_type']
      external_id?: string | null
    },
  ): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE documents SET
        content_sha256 = ?,
        name = ?,
        mime = ?,
        kind = ?,
        byte_size = ?,
        blob_path = ?,
        source_type = COALESCE(?, source_type),
        external_id = COALESCE(?, external_id),
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.content_sha256,
      patch.name,
      patch.mime,
      patch.kind,
      patch.byte_size,
      patch.blob_path,
      patch.source_type ?? null,
      patch.external_id === undefined ? null : patch.external_id,
      now,
      documentId,
    )
  }

  writeBlob(contentSha256: string, data: Buffer): string {
    const target = blobPathForSha(contentSha256)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, data)
    }
    return target
  }

  readBlob(documentId: string): Buffer | null {
    const doc = this.getDocument(documentId)
    if (!doc) return null
    try {
      return fs.readFileSync(doc.blob_path)
    } catch {
      return null
    }
  }

  upsertParsePending(
    documentId: string,
    engineId: ParseEngineId,
    engineVersion: string,
    opts: { force?: boolean } = {},
  ): void {
    if (opts.force) {
      this.db.prepare(`
        INSERT INTO parse_artifacts(document_id, engine_id, engine_version, status, page_count, char_count, md_path, error, ready_at, parse_fingerprint)
        VALUES(?, ?, ?, 'pending', NULL, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT(document_id) DO UPDATE SET
          engine_id = excluded.engine_id,
          engine_version = excluded.engine_version,
          status = 'pending',
          error = NULL,
          ready_at = NULL
      `).run(documentId, engineId, engineVersion)
      return
    }
    this.db.prepare(`
      INSERT INTO parse_artifacts(document_id, engine_id, engine_version, status, page_count, char_count, md_path, error, ready_at, parse_fingerprint)
      VALUES(?, ?, ?, 'pending', NULL, NULL, NULL, NULL, NULL, NULL)
      ON CONFLICT(document_id) DO UPDATE SET
        engine_id = excluded.engine_id,
        engine_version = excluded.engine_version,
        status = CASE WHEN parse_artifacts.status = 'ready' THEN parse_artifacts.status ELSE excluded.status END
    `).run(documentId, engineId, engineVersion)
  }

  getParseArtifact(documentId: string): ParseArtifactRow | null {
    const row = this.db.prepare(`
      SELECT document_id, engine_id, engine_version, status, page_count, char_count, md_path, error, ready_at, parse_fingerprint
      FROM parse_artifacts WHERE document_id = ?
    `).get(documentId) as ParseArtifactRow | undefined
    return row ?? null
  }

  markParseReady(
    documentId: string,
    input: {
      pageCount: number
      charCount: number
      markdown: string
      chunks: ParseChunkInput[]
      engineId?: ParseEngineId
      engineVersion?: string
    },
  ): ChunkRow[] {
    const mdPath = markdownPathForDocument(documentId)
    fs.mkdirSync(path.dirname(mdPath), { recursive: true })
    fs.writeFileSync(mdPath, input.markdown, 'utf8')

    const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE document_id = ?')
    const insertChunk = this.db.prepare(`
      INSERT INTO chunks(id, document_id, seq, page, offset, text, char_count, embedded_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, NULL)
    `)

    const chunkRows: ChunkRow[] = input.chunks.map((c, seq) => ({
      id: `${documentId}:c${seq}`,
      document_id: documentId,
      seq,
      page: c.page,
      offset: c.offset,
      text: c.text,
      char_count: c.text.length,
      embedded_at: null,
    }))

    const tx = this.db.transaction(() => {
      deleteChunks.run(documentId)
      for (const row of chunkRows) {
        insertChunk.run(row.id, row.document_id, row.seq, row.page, row.offset, row.text, row.char_count)
      }
      this.db.prepare(`
        UPDATE parse_artifacts SET
          status = 'ready',
          engine_id = COALESCE(?, engine_id),
          engine_version = COALESCE(?, engine_version),
          page_count = ?,
          char_count = ?,
          md_path = ?,
          error = NULL,
          ready_at = ?
        WHERE document_id = ?
      `).run(
        input.engineId ?? null,
        input.engineVersion ?? null,
        input.pageCount,
        input.charCount,
        mdPath,
        new Date().toISOString(),
        documentId,
      )
      this.db.prepare('UPDATE documents SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), documentId)
    })
    tx()
    replaceFtsForDocument(this.db, documentId, chunkRows)
    return chunkRows
  }

  markParseFailed(documentId: string, error: string, partial?: { pageCount?: number; charCount?: number }): void {
    this.db.prepare(`
      UPDATE parse_artifacts SET
        status = 'failed',
        error = ?,
        page_count = COALESCE(?, page_count),
        char_count = COALESCE(?, char_count),
        ready_at = NULL
      WHERE document_id = ?
    `).run(error, partial?.pageCount ?? null, partial?.charCount ?? null, documentId)
    this.db.prepare('UPDATE documents SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), documentId)
  }

  linkSession(sessionId: string, documentId: string, attachmentId: string | null): void {
    this.db.prepare(`
      INSERT INTO session_documents(session_id, document_id, attachment_id, linked_at)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(session_id, document_id) DO UPDATE SET
        attachment_id = COALESCE(excluded.attachment_id, session_documents.attachment_id),
        linked_at = excluded.linked_at
    `).run(sessionId, documentId, attachmentId, new Date().toISOString())
  }

  listSessionDocuments(sessionId: string): Array<SessionDocumentRow & {
    name: string
    mime: string
    kind: string
    status: ParseStatus
    page_count: number | null
    char_count: number | null
    error: string | null
  }> {
    return this.db.prepare(`
      SELECT
        sd.session_id,
        sd.document_id,
        sd.attachment_id,
        sd.linked_at,
        d.name,
        d.mime,
        d.kind,
        pa.status,
        pa.page_count,
        pa.char_count,
        pa.error
      FROM session_documents sd
      JOIN documents d ON d.id = sd.document_id
      LEFT JOIN parse_artifacts pa ON pa.document_id = sd.document_id
      WHERE sd.session_id = ?
      ORDER BY sd.linked_at ASC
    `).all(sessionId) as Array<SessionDocumentRow & {
      name: string
      mime: string
      kind: string
      status: ParseStatus
      page_count: number | null
      char_count: number | null
      error: string | null
    }>
  }

  resolveDocumentByAttachment(sessionId: string, attachmentId: string): string | null {
    const row = this.db.prepare(`
      SELECT document_id FROM session_documents
      WHERE session_id = ? AND attachment_id = ?
      LIMIT 1
    `).get(sessionId, attachmentId) as { document_id: string } | undefined
    return row?.document_id ?? null
  }

  getChunks(documentId: string): ChunkRow[] {
    return this.db.prepare(`
      SELECT id, document_id, seq, page, offset, text, char_count, embedded_at
      FROM chunks WHERE document_id = ?
      ORDER BY seq ASC
    `).all(documentId) as ChunkRow[]
  }

  getChunk(documentId: string, chunkId: string): ChunkRow | null {
    const row = this.db.prepare(`
      SELECT id, document_id, seq, page, offset, text, char_count, embedded_at
      FROM chunks WHERE document_id = ? AND id = ?
    `).get(documentId, chunkId) as ChunkRow | undefined
    return row ?? null
  }

  getChunksNeedingEmbed(documentId: string): ChunkRow[] {
    return this.db.prepare(`
      SELECT id, document_id, seq, page, offset, text, char_count, embedded_at
      FROM chunks
      WHERE document_id = ? AND embedded_at IS NULL
      ORDER BY seq ASC
    `).all(documentId) as ChunkRow[]
  }

  markChunksEmbedded(chunkIds: string[], embeddedAt = new Date().toISOString()): void {
    if (!chunkIds.length) return
    const stmt = this.db.prepare(`
      UPDATE chunks SET embedded_at = ? WHERE id = ?
    `)
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(embeddedAt, id)
      }
    })
    tx(chunkIds)
  }

  clearChunkEmbeddedAt(documentId: string): void {
    this.db.prepare(`
      UPDATE chunks SET embedded_at = NULL WHERE document_id = ?
    `).run(documentId)
  }

  readMarkdown(documentId: string): string | null {
    const artifact = this.getParseArtifact(documentId)
    if (!artifact?.md_path) return null
    try {
      return fs.readFileSync(artifact.md_path, 'utf8')
    } catch {
      return null
    }
  }
}
