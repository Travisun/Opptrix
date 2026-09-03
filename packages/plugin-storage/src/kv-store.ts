import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { resolvePluginDataDir } from '@opptrix/shared'
import type { PluginStorageService, PluginStorageTx } from './types.js'

const DB_FILE = 'storage.db'

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT NOT NULL PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kv_key_prefix ON kv(key);
  `)
}

function dirSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      total += dirSizeBytes(full)
    } else if (ent.isFile()) {
      try {
        total += fs.statSync(full).size
      } catch { /* ignore */ }
    }
  }
  return total
}

export type SqlitePluginKvStoreOptions = {
  pluginId: string
  dataRoot?: string
  quotaBytes?: number
}

export class SqlitePluginKvStore implements PluginStorageService {
  private readonly db: Database.Database
  private readonly dataDir: string
  private readonly quotaBytes: number

  constructor(opts: SqlitePluginKvStoreOptions) {
    const pluginId = opts.pluginId.trim()
    if (!pluginId) throw new Error('pluginId required')
    this.dataDir = opts.dataRoot ?? resolvePluginDataDir(pluginId)
    this.quotaBytes = opts.quotaBytes ?? 64 * 1024 * 1024
    fs.mkdirSync(this.dataDir, { recursive: true })
    const dbPath = path.join(this.dataDir, DB_FILE)
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    initSchema(this.db)
  }

  get<T>(key: string): T | null {
    const k = key.trim()
    if (!k) return null
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(k) as
      | { value: string }
      | undefined
    if (!row) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  set(key: string, value: unknown): void {
    const k = key.trim()
    if (!k) throw new Error('key required')
    const serialized = JSON.stringify(value)
    const nextBytes = dirSizeBytes(this.dataDir) + Buffer.byteLength(serialized, 'utf8')
    if (nextBytes > this.quotaBytes) {
      throw new Error(`plugin storage quota exceeded (${this.quotaBytes} bytes)`)
    }
    const updatedAt = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(k, serialized, updatedAt)
  }

  delete(key: string): void {
    const k = key.trim()
    if (!k) return
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(k)
  }

  keys(prefix?: string): string[] {
    const p = prefix?.trim() ?? ''
    const rows = p
      ? this.db.prepare('SELECT key FROM kv WHERE key LIKE ? ORDER BY key').all(`${p}%`) as Array<{ key: string }>
      : this.db.prepare('SELECT key FROM kv ORDER BY key').all() as Array<{ key: string }>
    return rows.map(r => r.key)
  }

  transaction(fn: (tx: PluginStorageTx) => void): void {
    const run = this.db.transaction(() => {
      fn({
        get: <T>(key: string) => this.get<T>(key),
        set: (key: string, value: unknown) => this.set(key, value),
        delete: (key: string) => this.delete(key),
      })
    })
    run()
  }

  close(): void {
    this.db.close()
  }

  getDataDir(): string {
    return this.dataDir
  }

  usageBytes(): number {
    return dirSizeBytes(this.dataDir)
  }
}
