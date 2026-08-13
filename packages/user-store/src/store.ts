import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  applySqliteMemoryPragmas,
  resolveUserDataRoot,
  runSqliteLightMaintenance,
  type SqliteLightMaintenanceOpts,
  type SqliteLightMaintenanceResult,
} from '@opptrix/shared'
import {
  initProviderSettingsSchema,
  ProviderSettingsRepository,
} from './provider-settings.js'
import {
  initSpeedRankingSchema,
  SpeedRankingRepository,
} from './speed-ranking.js'
import {
  initFreeProviderThrottleSchema,
  FreeProviderThrottleRepository,
} from './free-provider-throttle.js'
import { McpServersRepository } from './mcp-servers.js'
import {
  AgentVaultRepository,
  initAgentVaultSchema,
} from './agent-vault.js'
import {
  ScheduleRepository,
  initScheduleSchema,
  SCHEDULE_SCHEMA_MIGRATION_KEY,
} from './schedule.js'
import {
  clearFtsNews,
  clearFtsSessions,
  deleteFtsNews,
  deleteFtsSession,
  initFtsSchema,
  searchFtsNews,
  searchFtsSessions,
  upsertFtsNews,
  upsertFtsSession,
  type FtsNewsRow,
  type FtsSessionRow,
} from './fts.js'

const DB_FILE = 'opptrix.db'
const DEFAULT_DOCUMENT_PAGE_SIZE = 200

export interface DocumentPageCursor {
  updatedAt: string
  id: string
}

export interface ListDocumentPageOpts {
  limit?: number
  /** 上一页末行游标（ORDER BY updated_at DESC, id DESC，不含该行） */
  after?: DocumentPageCursor
}

export interface DocumentPageRow<T = unknown> {
  id: string
  updated_at: string
  data: T
}

export interface DocumentExtractPageRow {
  id: string
  updated_at: string
  values: Array<string | number | boolean | null>
}

export class UserDataStore {
  private static inst: UserDataStore | null = null
  private db: Database.Database
  readonly providerSettings: ProviderSettingsRepository
  readonly speedRanking: SpeedRankingRepository
  readonly freeProviderThrottle: FreeProviderThrottleRepository
  readonly mcpServers: McpServersRepository
  readonly agentVault: AgentVaultRepository
  readonly schedule: ScheduleRepository

  private constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    applySqliteMemoryPragmas(this.db, 'write')
    initProviderSettingsSchema(this.db)
    initSpeedRankingSchema(this.db)
    initFreeProviderThrottleSchema(this.db)
    initAgentVaultSchema(this.db)
    this.providerSettings = new ProviderSettingsRepository(this.db)
    this.speedRanking = new SpeedRankingRepository(this.db)
    this.freeProviderThrottle = new FreeProviderThrottleRepository(this.db)
    this.mcpServers = new McpServersRepository(this)
    this.agentVault = new AgentVaultRepository(this.db)
    this.initSchema()
    initScheduleSchema(this.db)
    this.schedule = new ScheduleRepository(
      this.db,
      (ns, id) => this.getDocument(ns, id),
      (ns, id, data) => this.setDocument(ns, id, data),
    )
    this.ensureScheduleSchemaMigration()
    this.migrateFromLegacyFiles()
    this.providerSettings.migrateFromLegacy(
      key => this.hasMigration(key),
      key => this.markMigration(key),
      (ns, id) => this.getDocument(ns, id),
    )
    this.providerSettings.migrateWebfeedToSinafinance(
      key => this.hasMigration(key),
      key => this.markMigration(key),
    )
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

  /**
   * 低频轻维护：incremental_vacuum（若启用）+ wal_checkpoint(TRUNCATE)；
   * 全库 VACUUM 仅当 opts/env 显式开启。不抛错由调用方决定。
   */
  runLightMaintenance(opts?: SqliteLightMaintenanceOpts): SqliteLightMaintenanceResult {
    return runSqliteLightMaintenance(this.db, opts)
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
    initFtsSchema(this.db)
  }

  /** 幂等：表已由 CREATE IF NOT EXISTS 创建，meta 标记保证迁移可观测 */
  private ensureScheduleSchemaMigration() {
    if (this.hasMigration(SCHEDULE_SCHEMA_MIGRATION_KEY)) return
    initScheduleSchema(this.db)
    this.markMigration(SCHEDULE_SCHEMA_MIGRATION_KEY)
  }

  getMetaFlag(key: string): boolean {
    return this.hasMigration(key)
  }

  setMetaFlag(key: string) {
    this.markMigration(key)
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

  /**
   * 分页列举文档（ORDER BY updated_at DESC, id DESC）。
   * 大 namespace（资讯/会话）请用本方法或 `iterateDocumentPages`，避免一次全表进内存。
   */
  listDocumentPage<T>(namespace: string, opts?: ListDocumentPageOpts): DocumentPageRow<T>[] {
    const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_DOCUMENT_PAGE_SIZE, 1), 1000)
    const after = opts?.after
    const rows = after
      ? this.db.prepare(`
          SELECT id, updated_at, data FROM documents
          WHERE namespace = ?
            AND (
              updated_at < ?
              OR (updated_at = ? AND id < ?)
            )
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `).all(namespace, after.updatedAt, after.updatedAt, after.id, limit) as Array<{
          id: string
          updated_at: string
          data: string
        }>
      : this.db.prepare(`
          SELECT id, updated_at, data FROM documents
          WHERE namespace = ?
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `).all(namespace, limit) as Array<{
          id: string
          updated_at: string
          data: string
        }>

    const out: DocumentPageRow<T>[] = []
    for (const row of rows) {
      try {
        out.push({
          id: row.id,
          updated_at: row.updated_at,
          data: JSON.parse(row.data) as T,
        })
      } catch { /* skip corrupt */ }
    }
    return out
  }

  /**
   * 轻量投影分页：只取 id + json_extract 字段，不把整篇 JSON 解析进 JS 对象图。
   * `paths` 如 `['$.pub_date', '$.subscription_id']`，对应返回 `values` 同序。
   */
  listDocumentExtractPage(
    namespace: string,
    paths: string[],
    opts?: ListDocumentPageOpts,
  ): DocumentExtractPageRow[] {
    if (!paths.length) return []
    for (const p of paths) {
      if (!/^\$(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(p)) {
        throw new Error(`invalid json extract path: ${p}`)
      }
    }
    const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_DOCUMENT_PAGE_SIZE, 1), 1000)
    const extractCols = paths.map((p, i) => `json_extract(data, '${p}') AS e${i}`).join(', ')
    const after = opts?.after
    const sql = after
      ? `
          SELECT id, updated_at, ${extractCols}
          FROM documents
          WHERE namespace = ?
            AND (
              updated_at < ?
              OR (updated_at = ? AND id < ?)
            )
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `
      : `
          SELECT id, updated_at, ${extractCols}
          FROM documents
          WHERE namespace = ?
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `
    const rawRows = after
      ? this.db.prepare(sql).all(namespace, after.updatedAt, after.updatedAt, after.id, limit)
      : this.db.prepare(sql).all(namespace, limit)

    return (rawRows as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id ?? ''),
      updated_at: String(row.updated_at ?? ''),
      values: paths.map((_, i) => {
        const v = row[`e${i}`]
        if (v == null) return null
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
        return String(v)
      }),
    }))
  }

  /** 按页迭代整个 namespace（每页有界） */
  *iterateDocumentPages<T>(
    namespace: string,
    pageSize = DEFAULT_DOCUMENT_PAGE_SIZE,
  ): Generator<DocumentPageRow<T>[]> {
    let after: DocumentPageCursor | undefined
    for (;;) {
      const page = this.listDocumentPage<T>(namespace, { limit: pageSize, after })
      if (!page.length) return
      yield page
      const last = page[page.length - 1]
      after = { updatedAt: last.updated_at, id: last.id }
      if (page.length < pageSize) return
    }
  }

  /**
   * 一次加载 namespace 下全部文档到数组。大表慎用 — 优先 `listDocumentPage` / `iterateDocumentPages`。
   */
  listDocuments<T>(namespace: string): T[] {
    const out: T[] = []
    for (const page of this.iterateDocumentPages<T>(namespace)) {
      for (const row of page) out.push(row.data)
    }
    return out
  }

  listDocumentIds(namespace: string): string[] {
    const out: string[] = []
    const pageSize = DEFAULT_DOCUMENT_PAGE_SIZE
    let after: DocumentPageCursor | undefined
    for (;;) {
      const rows = after
        ? this.db.prepare(`
            SELECT id, updated_at FROM documents
            WHERE namespace = ?
              AND (
                updated_at < ?
                OR (updated_at = ? AND id < ?)
              )
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
          `).all(namespace, after.updatedAt, after.updatedAt, after.id, pageSize) as Array<{
            id: string
            updated_at: string
          }>
        : this.db.prepare(`
            SELECT id, updated_at FROM documents
            WHERE namespace = ?
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
          `).all(namespace, pageSize) as Array<{ id: string; updated_at: string }>
      if (!rows.length) break
      for (const row of rows) out.push(row.id)
      const last = rows[rows.length - 1]
      after = { updatedAt: last.updated_at, id: last.id }
      if (rows.length < pageSize) break
    }
    return out
  }

  indexSessionSearch(row: FtsSessionRow) {
    upsertFtsSession(this.db, row)
  }

  removeSessionSearch(sessionId: string) {
    deleteFtsSession(this.db, sessionId)
  }

  searchSessions(query: string, opts?: { limit?: number; includeArchived?: boolean }) {
    return searchFtsSessions(this.db, query, opts)
  }

  clearSessionSearchIndex() {
    clearFtsSessions(this.db)
  }

  indexNewsSearch(row: FtsNewsRow) {
    upsertFtsNews(this.db, row)
  }

  removeNewsSearch(articleId: string) {
    deleteFtsNews(this.db, articleId)
  }

  searchNews(query: string, limit?: number) {
    return searchFtsNews(this.db, query, limit)
  }

  clearNewsSearchIndex() {
    clearFtsNews(this.db)
  }
}

export function getUserDataStore(): UserDataStore {
  return UserDataStore.getInstance()
}
