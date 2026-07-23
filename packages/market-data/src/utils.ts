import type Database from 'better-sqlite3'
import {
  detectAppliedSchemaVersion,
  migrateSchema,
  readDeclaredSchemaVersion,
} from './schema-migrate.js'

export {
  detectAppliedSchemaVersion,
  hasInstrumentCompositeKey,
  migrateSchema,
  MIGRATION_STEPS,
  readDeclaredSchemaVersion,
  reconcileV5Preflight,
  SchemaMigrationError,
} from './schema-migrate.js'

/** 打开 market-data 库时执行 — 按注册表逐步升级到 SCHEMA_VERSION */
export function migrate(db: Database.Database): void {
  migrateSchema(db)
}

/** @deprecated 使用 readDeclaredSchemaVersion */
export function currentSchemaVersion(db: Database.Database): number {
  return readDeclaredSchemaVersion(db)
}

/** Normalize exchange for instruments composite PK — NULL → '' */
export function normalizeInstrumentExchange(exchange?: string | null): string {
  const trimmed = exchange?.trim()
  return trimmed ? trimmed.toUpperCase() : ''
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

/** Infer CN exchange from bare 6-digit code — no DB lookup (dump import fast path). */
export function inferCnStockMarket(code: string): 'SH' | 'SZ' | 'BJ' | null {
  const c = normalizeStockCode(code)
  if (c.startsWith('6')) return 'SH'
  if (c.startsWith('0') || c.startsWith('3')) return 'SZ'
  if (c.startsWith('8') || c.startsWith('4') || c.startsWith('92')) return 'BJ'
  return null
}

export function detectSt(name: string): boolean {
  return /^\*?ST/i.test(name.trim())
}

export function daysSince(iso: string | null, now: number | Date = Date.now()): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const nowMs = typeof now === 'number' ? now : now.getTime()
  return (nowMs - new Date(iso).getTime()) / 86400000
}

export function minutesSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(iso).getTime()) / 60000
}
