import type Database from 'better-sqlite3'

export type FtsSessionRow = {
  session_id: string
  title: string
  body: string
  archived: number
  archive_folder_id: string
  updated_at: string
}

export type FtsNewsRow = {
  article_id: string
  title: string
  body: string
  pub_date: string
  source_title: string
}

export function initFtsSchema(db: Database.Database) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_sessions USING fts5(
      session_id UNINDEXED,
      title,
      body,
      archived UNINDEXED,
      archive_folder_id UNINDEXED,
      updated_at UNINDEXED,
      tokenize = 'unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_news USING fts5(
      article_id UNINDEXED,
      title,
      body,
      pub_date UNINDEXED,
      source_title UNINDEXED,
      tokenize = 'unicode61'
    );
  `)
}

function ftsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map(t => t.replace(/["'*]/g, '').trim())
    .filter(t => t.length >= 1)
  if (!tokens.length) return ''
  return tokens.map(t => `"${t}"*`).join(' ')
}

export function upsertFtsSession(db: Database.Database, row: FtsSessionRow) {
  db.prepare('DELETE FROM fts_sessions WHERE session_id = ?').run(row.session_id)
  db.prepare(`
    INSERT INTO fts_sessions(session_id, title, body, archived, archive_folder_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.session_id,
    row.title,
    row.body,
    row.archived,
    row.archive_folder_id,
    row.updated_at,
  )
}

export function deleteFtsSession(db: Database.Database, sessionId: string) {
  db.prepare('DELETE FROM fts_sessions WHERE session_id = ?').run(sessionId)
}

export function searchFtsSessions(
  db: Database.Database,
  query: string,
  opts: { limit?: number; includeArchived?: boolean } = {},
): Array<{ session_id: string; title: string; snippet: string; rank: number }> {
  const q = ftsQuery(query)
  if (!q) return []
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const archivedFilter = opts.includeArchived === false ? 'AND archived = 0' : ''
  try {
    return db.prepare(`
      SELECT
        session_id,
        title,
        snippet(fts_sessions, 1, '<b>', '</b>', '…', 24) AS snippet,
        rank
      FROM fts_sessions
      WHERE fts_sessions MATCH ?
        ${archivedFilter}
      ORDER BY rank
      LIMIT ?
    `).all(q, limit) as Array<{ session_id: string; title: string; snippet: string; rank: number }>
  } catch {
    return []
  }
}

export function upsertFtsNews(db: Database.Database, row: FtsNewsRow) {
  db.prepare('DELETE FROM fts_news WHERE article_id = ?').run(row.article_id)
  db.prepare(`
    INSERT INTO fts_news(article_id, title, body, pub_date, source_title)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.article_id, row.title, row.body, row.pub_date, row.source_title)
}

export function deleteFtsNews(db: Database.Database, articleId: string) {
  db.prepare('DELETE FROM fts_news WHERE article_id = ?').run(articleId)
}

export function searchFtsNews(
  db: Database.Database,
  query: string,
  limit = 20,
): Array<{ article_id: string; title: string; snippet: string; pub_date: string; source_title: string; rank: number }> {
  const q = ftsQuery(query)
  if (!q) return []
  const cap = Math.min(Math.max(limit, 1), 50)
  try {
    return db.prepare(`
      SELECT
        article_id,
        title,
        snippet(fts_news, 1, '<b>', '</b>', '…', 32) AS snippet,
        pub_date,
        source_title,
        rank
      FROM fts_news
      WHERE fts_news MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(q, cap) as Array<{ article_id: string; title: string; snippet: string; pub_date: string; source_title: string; rank: number }>
  } catch {
    return []
  }
}

export function clearFtsSessions(db: Database.Database) {
  db.exec('DELETE FROM fts_sessions')
}

export function clearFtsNews(db: Database.Database) {
  db.exec('DELETE FROM fts_news')
}
