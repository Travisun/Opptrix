import type Database from 'better-sqlite3'
import {
  MIGRATION_SQL,
  MIGRATION_V2_SQL,
  MIGRATION_V3_SQL,
  MIGRATION_V4_SQL,
  MIGRATION_V5_SQL,
  MIGRATION_V6_SQL,
  MIGRATION_V7_SQL,
  MIGRATION_V8_SQL,
  MIGRATION_V8_PRESERVE_NS_SQL,
  MIGRATION_V10_SQL,
  MIGRATION_V11_SQL,
  MIGRATION_V12_SQL,
  MIGRATION_V13_SQL,
  SCHEMA_VERSION,
} from './schema.js'
import {
  isDuckPrimaryMigrationMarked,
} from './duck/duck-primary-migration.js'
import {
  ensureInstrumentNsSchema,
  hasInstrumentNsColumn,
  isInstrumentNsSchemaComplete,
  runInstrumentNsBackfill,
  stockProfilesUsesInstrumentNs,
} from './instrument-ns.js'

/** 单步 schema 迁移 — 每增版本在此注册 up + isApplied */
export interface SchemaMigrationStep {
  version: number
  description: string
  isApplied: (db: Database.Database) => boolean
  up: (db: Database.Database) => void
}

export class SchemaMigrationError extends Error {
  readonly schemaVersion: number

  constructor(schemaVersion: number, message: string) {
    super(`market-data schema v${schemaVersion}: ${message}`)
    this.name = 'SchemaMigrationError'
    this.schemaVersion = schemaVersion
  }
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name))
}

function viewExists(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = ?",
  ).get(name))
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some(c => c.name === column)
}

function instrumentsTableSql(db: Database.Database): string | null {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instruments'",
  ).get() as { sql: string } | undefined
  return row?.sql ?? null
}

export function hasInstrumentCompositeKey(db: Database.Database): boolean {
  const ddl = instrumentsTableSql(db)
  return Boolean(ddl?.includes('PRIMARY KEY (market, exchange, code, asset_class)'))
}

/** 极早期 v5 草稿（id/symbol 列）— 在 v5 之前修复 */
export function reconcileV5Preflight(db: Database.Database): void {
  if (!tableExists(db, 'instruments')) return
  if (columnExists(db, 'instruments', 'code')) return
  db.exec(`
    DROP TABLE IF EXISTS etf_holdings;
    DROP TABLE IF EXISTS etf_nav_daily;
    DROP TABLE IF EXISTS etf_profiles;
    DROP TABLE IF EXISTS instruments;
  `)
}

/** schema_meta 中记录的最高版本（声明版本） */
export function readDeclaredSchemaVersion(db: Database.Database): number {
  if (!tableExists(db, 'schema_meta')) return 0
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_meta').get() as { v: number | null } | undefined
  return row?.v ?? 0
}

/** 从 v1 起连续检测已落地的最高结构版本（实际版本） */
export function detectAppliedSchemaVersion(db: Database.Database): number {
  let applied = 0
  for (const step of MIGRATION_STEPS) {
    if (!step.isApplied(db)) break
    applied = step.version
  }
  return applied
}

function recordSchemaVersion(db: Database.Database, version: number): void {
  if (readDeclaredSchemaVersion(db) >= version) return
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
    version,
    new Date().toISOString(),
  )
}

function klineStorageUsesDuckdb(db: Database.Database): boolean {
  const row = db.prepare(
    "SELECT meta_json FROM sync_cursor WHERE job_name = 'kline_storage'",
  ).get() as { meta_json: string | null } | undefined
  if (!row?.meta_json) return false
  try {
    const meta = JSON.parse(row.meta_json) as { backend?: string }
    return meta.backend === 'duckdb'
  } catch {
    return false
  }
}

function analyticsStorageReady(db: Database.Database): boolean {
  const row = db.prepare(
    "SELECT meta_json FROM sync_cursor WHERE job_name = 'analytics_storage'",
  ).get() as { meta_json: string | null } | undefined
  if (!row?.meta_json) return false
  try {
    const meta = JSON.parse(row.meta_json) as { backend?: string; dims?: boolean }
    return meta.backend === 'duckdb' && meta.dims === true
  } catch {
    return false
  }
}

function marketDataStorageReady(db: Database.Database): boolean {
  const row = db.prepare(
    "SELECT meta_json FROM sync_cursor WHERE job_name = 'market_data_storage'",
  ).get() as { meta_json: string | null } | undefined
  if (!row?.meta_json) return false
  try {
    const meta = JSON.parse(row.meta_json) as { backend?: string; primary?: boolean }
    return meta.backend === 'duckdb' && meta.primary === true
  } catch {
    return false
  }
}

export const MIGRATION_STEPS: SchemaMigrationStep[] = [
  {
    version: 1,
    description: 'bootstrap stocks and core analytics tables',
    isApplied: (db) => tableExists(db, 'stocks') && tableExists(db, 'schema_meta'),
    up: (db) => { db.exec(MIGRATION_SQL) },
  },
  {
    version: 2,
    description: 'sync job progress and enrichment child tables',
    isApplied: (db) => tableExists(db, 'sync_job_progress'),
    up: (db) => { db.exec(MIGRATION_V2_SQL) },
  },
  {
    version: 3,
    description: 'sync sessions and logs',
    isApplied: (db) => tableExists(db, 'sync_sessions'),
    up: (db) => { db.exec(MIGRATION_V3_SQL) },
  },
  {
    version: 4,
    description: 'daily klines table',
    isApplied: (db) => tableExists(db, 'stock_klines_daily'),
    up: (db) => { db.exec(MIGRATION_V4_SQL) },
  },
  {
    version: 5,
    description: 'instruments registry and ETF tables',
    isApplied: (db) => tableExists(db, 'instruments') && columnExists(db, 'instruments', 'code'),
    up: (db) => {
      reconcileV5Preflight(db)
      db.exec(MIGRATION_V5_SQL)
    },
  },
  {
    version: 6,
    description: 'backfill CN equity into instruments and unified views',
    isApplied: (db) => viewExists(db, 'v_instruments_unified'),
    up: (db) => { db.exec(MIGRATION_V6_SQL) },
  },
  {
    version: 7,
    description: 'cross-market bars and taxonomy',
    isApplied: (db) => tableExists(db, 'instrument_bars_daily'),
    up: (db) => { db.exec(MIGRATION_V7_SQL) },
  },
  {
    version: 8,
    description: 'instruments composite primary key',
    isApplied: (db) => hasInstrumentCompositeKey(db),
    up: (db) => {
      if (hasInstrumentCompositeKey(db)) return
      db.exec(hasInstrumentNsColumn(db) ? MIGRATION_V8_PRESERVE_NS_SQL : MIGRATION_V8_SQL)
    },
  },
  {
    version: 9,
    description: 'instrument_ns columns and stock_profiles FK anchor',
    isApplied: (db) => isInstrumentNsSchemaComplete(db) && stockProfilesUsesInstrumentNs(db),
    up: (db) => {
      ensureInstrumentNsSchema(db)
      runInstrumentNsBackfill(db)
    },
  },
  {
    version: 10,
    description: 'kline storage backend marker (DuckDB + SQLite)',
    isApplied: (db) => klineStorageUsesDuckdb(db),
    up: (db) => { db.exec(MIGRATION_V10_SQL) },
  },
  {
    version: 11,
    description: 'DuckDB analytics layer marker (dims/quotes/factors)',
    isApplied: (db) => analyticsStorageReady(db),
    up: (db) => { db.exec(MIGRATION_V11_SQL) },
  },
  {
    version: 12,
    description: 'market data primary storage on DuckDB',
    isApplied: (db) => marketDataStorageReady(db),
    up: (db) => { db.exec(MIGRATION_V12_SQL) },
  },
  {
    version: 13,
    description: 'DuckDB primary storage one-shot migration gate',
    isApplied: (db) => isDuckPrimaryMigrationMarked(db),
    up: (db) => { db.exec(MIGRATION_V13_SQL) },
  },
]

if (MIGRATION_STEPS.length !== SCHEMA_VERSION) {
  throw new Error(
    `MIGRATION_STEPS (${MIGRATION_STEPS.length}) must match SCHEMA_VERSION (${SCHEMA_VERSION})`,
  )
}

/**
 * 跨版本数据库升级入口。
 *
 * 逻辑：
 * 1. 按 v1…vN 顺序逐步执行，每步先 isApplied 检测，未落地则 up
 * 2. up 后再次 isApplied 校验，失败则抛错且不写 schema_meta（可重试）
 * 3. 仅在校验通过后写入 schema_meta，支持声明版本落后于实际 DDL 的修复
 * 4. v9 之后每次启动幂等执行 runInstrumentNsBackfill 补数据
 */
export function migrateSchema(db: Database.Database): void {
  for (const step of MIGRATION_STEPS) {
    if (!step.isApplied(db)) {
      step.up(db)
    }

    if (!step.isApplied(db)) {
      throw new SchemaMigrationError(
        step.version,
        `structure verification failed after migration (${step.description})`,
      )
    }

    recordSchemaVersion(db, step.version)
  }

  if (detectAppliedSchemaVersion(db) >= 9) {
    runInstrumentNsBackfill(db)
  }
}
