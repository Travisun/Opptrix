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

export function detectSt(name: string): boolean {
  return /^\*?ST/i.test(name.trim())
}

export function daysSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(iso).getTime()) / 86400000
}
