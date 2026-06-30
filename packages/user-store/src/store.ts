import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { resolveUserDataRoot } from '@opptrix/shared'

const DB_FILE = 'opptrix.db'

export class UserDataStore {
  private static inst: UserDataStore | null = null
  private db: Database.Database

  private constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
    this.migrateFromLegacyFiles()
  }

  static getInstance(): UserDataStore {
    if (!UserDataStore.inst) {
      const dbPath = path.join(resolveUserDataRoot(), DB_FILE)
      UserDataStore.inst = new UserDataStore(dbPath)
    }
    return UserDataStore.inst
  }

  static dbPath(): string {
    return path.join(resolveUserDataRoot(), DB_FILE)
  }

  close() {
    this.db.close()
    UserDataStore.inst = null
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        namespace TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      );

      CREATE INDEX IF NOT EXISTS idx_documents_namespace_updated
        ON documents(namespace, updated_at DESC);
    `)
  }

  private hasMigration(key: string): boolean {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value === '1'
  }

  private markMigration(key: string) {
    this.db.prepare(`
      INSERT INTO meta(key, value) VALUES(?, '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key)
  }

  private readJsonFile<T>(filePath: string): T | null {
    try {
      if (!fs.existsSync(filePath)) return null
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
    } catch {
      return null
    }
  }

  private migrateFromLegacyFiles() {
    if (this.hasMigration('legacy_json_v1')) return

    const userRoot = resolveUserDataRoot()
    const legacyRoots = [userRoot, path.join(os.homedir(), '.a_stock_layer')]

    for (const root of legacyRoots) {
      const watchlist = this.readJsonFile<{ items?: unknown[] }>(path.join(root, 'watchlist.json'))
      if (watchlist?.items?.length) {
        this.setDocument('watchlist', 'default', watchlist)
        break
      }
    }

    for (const root of legacyRoots) {
      const portfolio = this.readJsonFile<unknown>(path.join(root, 'portfolio.json'))
      if (portfolio) {
        this.setDocument('portfolio', 'default', portfolio)
        break
      }
    }

    for (const root of legacyRoots) {
      const tushare = this.readJsonFile<unknown>(path.join(root, 'tushare-config.json'))
      if (tushare) {
        this.setDocument('tushare_config', 'default', tushare)
        break
      }
    }

    for (const root of legacyRoots) {
      const sessionsDir = path.join(root, 'sessions')
      if (!fs.existsSync(sessionsDir)) continue
      for (const file of fs.readdirSync(sessionsDir).filter(name => name.endsWith('.json'))) {
        const session = this.readJsonFile<unknown>(path.join(sessionsDir, file))
        const id = (session as { id?: string })?.id ?? file.replace(/\.json$/, '')
        if (session && id) this.setDocument('session', id, session)
      }
    }

    this.markMigration('legacy_json_v1')
  }

  getDocument<T>(namespace: string, id: string): T | null {
    const row = this.db.prepare(
      'SELECT data FROM documents WHERE namespace = ? AND id = ?',
    ).get(namespace, id) as { data: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.data) as T
    } catch {
      return null
    }
  }

  setDocument(namespace: string, id: string, data: unknown) {
    const updatedAt = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO documents(namespace, id, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(namespace, id, JSON.stringify(data), updatedAt)
  }

  deleteDocument(namespace: string, id: string) {
    this.db.prepare('DELETE FROM documents WHERE namespace = ? AND id = ?').run(namespace, id)
  }

  listDocuments<T>(namespace: string): T[] {
    const rows = this.db.prepare(
      'SELECT data FROM documents WHERE namespace = ? ORDER BY updated_at DESC',
    ).all(namespace) as { data: string }[]
    const out: T[] = []
    for (const row of rows) {
      try {
        out.push(JSON.parse(row.data) as T)
      } catch { /* skip corrupt */ }
    }
    return out
  }

  listDocumentIds(namespace: string): string[] {
    const rows = this.db.prepare(
      'SELECT id FROM documents WHERE namespace = ? ORDER BY updated_at DESC',
    ).all(namespace) as { id: string }[]
    return rows.map(row => row.id)
  }
}

export function getUserDataStore(): UserDataStore {
  return UserDataStore.getInstance()
}
