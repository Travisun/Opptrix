import type Database from 'better-sqlite3'
import { MIGRATION_SQL, MIGRATION_V2_SQL, MIGRATION_V3_SQL, SCHEMA_VERSION } from './schema.js'

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
      SCHEMA_VERSION,
      new Date().toISOString(),
    )
  }
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
