import type Database from 'better-sqlite3'
import { DOC_LIBRARY_SCHEMA_VERSION, MIGRATION_V1_SQL, MIGRATION_V2_SQL } from './schema.js'

export interface SchemaMigrationStep {
  version: number
  description: string
  isApplied: (db: Database.Database) => boolean
  up: (db: Database.Database) => void
}

export class DocLibrarySchemaMigrationError extends Error {
  readonly schemaVersion: number

  constructor(schemaVersion: number, message: string) {
    super(`doc-library schema v${schemaVersion}: ${message}`)
    this.name = 'DocLibrarySchemaMigrationError'
    this.schemaVersion = schemaVersion
  }
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name))
}

function ftsTableExists(db: Database.Database): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fts_chunks'",
  ).get())
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some(c => c.name === column)
}

function isV1Applied(db: Database.Database): boolean {
  return tableExists(db, 'documents')
    && tableExists(db, 'parse_artifacts')
    && tableExists(db, 'chunks')
    && tableExists(db, 'session_documents')
    && ftsTableExists(db)
}

function isV2Applied(db: Database.Database): boolean {
  return isV1Applied(db) && columnExists(db, 'chunks', 'embedded_at')
}

export const MIGRATION_STEPS: SchemaMigrationStep[] = [
  {
    version: 1,
    description: 'documents / parse_artifacts / chunks / session_documents / fts_chunks',
    isApplied: isV1Applied,
    up(db) {
      db.exec(MIGRATION_V1_SQL)
    },
  },
  {
    version: 2,
    description: 'chunks.embedded_at for vector index idempotency',
    isApplied: isV2Applied,
    up(db) {
      if (!columnExists(db, 'chunks', 'embedded_at')) {
        db.exec(MIGRATION_V2_SQL)
      }
    },
  },
]

if (MIGRATION_STEPS.length !== DOC_LIBRARY_SCHEMA_VERSION) {
  throw new Error(
    `MIGRATION_STEPS (${MIGRATION_STEPS.length}) must match DOC_LIBRARY_SCHEMA_VERSION (${DOC_LIBRARY_SCHEMA_VERSION})`,
  )
}

export function detectAppliedSchemaVersion(db: Database.Database): number {
  let applied = 0
  for (const step of MIGRATION_STEPS) {
    if (!step.isApplied(db)) break
    applied = step.version
  }
  return applied
}

export function migrateDocLibrarySchema(db: Database.Database): number {
  for (const step of MIGRATION_STEPS) {
    if (step.isApplied(db)) continue
    step.up(db)
    if (!step.isApplied(db)) {
      throw new DocLibrarySchemaMigrationError(step.version, `migration failed: ${step.description}`)
    }
    db.prepare(`
      INSERT INTO schema_meta(version, applied_at) VALUES(?, ?)
      ON CONFLICT(version) DO UPDATE SET applied_at = excluded.applied_at
    `).run(step.version, new Date().toISOString())
  }
  return detectAppliedSchemaVersion(db)
}
