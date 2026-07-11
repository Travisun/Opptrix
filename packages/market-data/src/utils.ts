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
  MIGRATION_V9_SQL,
  SCHEMA_VERSION,
} from './schema.js'
import { runInstrumentNsBackfill } from './instrument-ns.js'

function currentVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_meta').get() as { v: number | null } | undefined
  return row?.v ?? 0
}

export function migrate(db: Database.Database): void {
  db.exec(MIGRATION_SQL)
  const ver = currentVersion(db)
  if (ver === 0) {
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      1,
      new Date().toISOString(),
    )
  }
  if (currentVersion(db) < 2) {
    db.exec(MIGRATION_V2_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      2,
      new Date().toISOString(),
    )
  }
  if (currentVersion(db) < 3) {
    db.exec(MIGRATION_V3_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      3,
      new Date().toISOString(),
    )
  }
  if (currentVersion(db) < 4) {
    db.exec(MIGRATION_V4_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      4,
      new Date().toISOString(),
    )
  }
  if (currentVersion(db) < 5) {
    db.exec(MIGRATION_V5_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      5,
      new Date().toISOString(),
    )
  }
  if (currentVersion(db) < 6) {
    db.exec(MIGRATION_V6_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      6,
      new Date().toISOString(),
    )
  }
  if (currentVersion(db) < 7) {
    db.exec(MIGRATION_V7_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
      7,
      new Date().toISOString(),
    )
  }
  if (currentVersion(db) < SCHEMA_VERSION) {
    if (currentVersion(db) < 8) {
      db.exec(MIGRATION_V8_SQL)
      db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
        8,
        new Date().toISOString(),
      )
    }
    if (currentVersion(db) < 9) {
      try {
        db.exec(MIGRATION_V9_SQL)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('duplicate column name')) throw e
      }
      db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(
        9,
        new Date().toISOString(),
      )
    }
  }
  reconcileV5Schema(db)
  ensureInstrumentCompositeKey(db)
  runInstrumentNsBackfill(db)
}

/** Normalize exchange for instruments composite PK — NULL → '' */
export function normalizeInstrumentExchange(exchange?: string | null): string {
  const trimmed = exchange?.trim()
  return trimmed ? trimmed.toUpperCase() : ''
}

function instrumentsTableSql(db: Database.Database): string | null {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instruments'",
  ).get() as { sql: string } | undefined
  return row?.sql ?? null
}

function hasInstrumentCompositeKey(db: Database.Database): boolean {
  const ddl = instrumentsTableSql(db)
  return Boolean(ddl?.includes('PRIMARY KEY (market, exchange, code, asset_class)'))
}

/** v8 safety net — schema_meta may be ahead of table DDL after partial failure */
function ensureInstrumentCompositeKey(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(instruments)').all() as { name: string }[]
  if (cols.length === 0) return
  if (hasInstrumentCompositeKey(db)) return
  if (currentVersion(db) < 8) return
  db.exec(MIGRATION_V8_SQL)
}

/** Early v5 draft used id/symbol columns — recreate if needed */
function reconcileV5Schema(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(instruments)').all() as { name: string }[]
  if (cols.length === 0) return
  if (cols.some(c => c.name === 'code')) return
  db.exec(`
    DROP TABLE IF EXISTS etf_holdings;
    DROP TABLE IF EXISTS etf_nav_daily;
    DROP TABLE IF EXISTS etf_profiles;
    DROP TABLE IF EXISTS instruments;
  `)
  db.exec(MIGRATION_V5_SQL)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayTradeDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function normalizeStockCode(code: string): string {
  return code.trim().padStart(6, '0')
}

export function detectSt(name: string): boolean {
  return /^\*?ST/i.test(name.trim())
}

export function daysSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(iso).getTime()) / 86400000
}
