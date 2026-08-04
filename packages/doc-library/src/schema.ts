/** doc-library.db schema 版本；与 MIGRATION_STEPS 步数一致 */
export const DOC_LIBRARY_SCHEMA_VERSION = 2

export const MIGRATION_V1_SQL = `
  CREATE TABLE IF NOT EXISTS schema_meta (
    version INTEGER NOT NULL PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT NOT NULL PRIMARY KEY,
    content_sha256 TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    kind TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    blob_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_documents_sha ON documents(content_sha256);

  CREATE TABLE IF NOT EXISTS parse_artifacts (
    document_id TEXT NOT NULL PRIMARY KEY,
    engine_id TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    status TEXT NOT NULL,
    page_count INTEGER,
    char_count INTEGER,
    md_path TEXT,
    error TEXT,
    ready_at TEXT,
    parse_fingerprint TEXT,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT NOT NULL PRIMARY KEY,
    document_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    page INTEGER NOT NULL,
    offset INTEGER NOT NULL,
    text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id, seq);

  CREATE TABLE IF NOT EXISTS session_documents (
    session_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    attachment_id TEXT,
    linked_at TEXT NOT NULL,
    PRIMARY KEY (session_id, document_id),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_session_documents_session ON session_documents(session_id, linked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_session_documents_attachment ON session_documents(session_id, attachment_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
    chunk_id UNINDEXED,
    document_id UNINDEXED,
    text,
    tokenize = 'unicode61'
  );
`

/** v2：chunk 级 embedded_at，标记已写入向量索引 */
export const MIGRATION_V2_SQL = `
  ALTER TABLE chunks ADD COLUMN embedded_at TEXT;
`
