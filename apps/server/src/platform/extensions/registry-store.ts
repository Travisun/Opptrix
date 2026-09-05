/**
 * Extension registry persistence — R0/R1 lifecycle foundation.
 *
 * Persists extension records to ~/.opptrix/extensions/registry.db so that
 * installed extensions survive server restart (R0 Phase 1 scan on boot).
 *
 * Phase A: single-table registry. Per-extension private KV lives separately
 * in plugin-data/{id}/ (plugin-storage package, wired in Package 3).
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { resolveExtensionsDir } from '@opptrix/shared'
import type { ExtensionRecord } from './types.js'

function sanitizeId(id: string): string {
  // Mirror plugin-storage path safety: alphanumerics + . _ - only.
  return id.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export type ExtensionRegistryStore = {
  /** Load all persisted records. Safe to call multiple times (idempotent). */
  loadAll(): ExtensionRecord[]
  /** Insert or update a record. */
  upsert(record: ExtensionRecord): void
  /** Delete a record by id. */
  remove(id: string): void
  /** Close the underlying SQLite handle. Idempotent. */
  close(): void
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'inactive',
  name TEXT,
  version TEXT,
  capabilities TEXT NOT NULL DEFAULT '[]',
  permissions TEXT NOT NULL DEFAULT '[]',
  activation TEXT NOT NULL DEFAULT 'catalog_only',
  activation_events TEXT NOT NULL DEFAULT '[]',
  trusted INTEGER NOT NULL DEFAULT 0,
  host_bound INTEGER NOT NULL DEFAULT 0,
  js_loaded INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  entry_path TEXT,
  contributes TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_extensions_state ON extensions(state);
`

/** Idempotent column migrations for registry.db files created by older builds
 * (CREATE TABLE IF NOT EXISTS never adds columns to an existing table — the
 * INSERT/SELECT prepared statements would then fail on every boot). */
function migrateSchema(db: Database.Database): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(extensions)').all() as Array<{ name: string }>).map(
      (c) => c.name,
    ),
  )
  if (existing.size === 0) return // fresh table — SCHEMA already created it
  const additions: Array<[string, string]> = [
    ['permissions', `ALTER TABLE extensions ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'`],
    ['activation_events', `ALTER TABLE extensions ADD COLUMN activation_events TEXT NOT NULL DEFAULT '[]'`],
    ['entry_path', 'ALTER TABLE extensions ADD COLUMN entry_path TEXT'],
    ['contributes', "ALTER TABLE extensions ADD COLUMN contributes TEXT NOT NULL DEFAULT '{}'"],
  ]
  for (const [col, ddl] of additions) {
    if (!existing.has(col)) db.exec(ddl)
  }
  db.pragma(`user_version = 1`)
}

function rowToRecord(row: Record<string, unknown>): ExtensionRecord {
  const rec: ExtensionRecord = {
    id: String(row.id),
    state: row.state as ExtensionRecord['state'],
    trusted: row.trusted === 1,
    hostBound: row.host_bound === 1,
    jsLoaded: row.js_loaded === 1,
  }
  if (row.name != null) rec.name = String(row.name)
  if (row.version != null) rec.version = String(row.version)
  if (row.error != null) rec.error = String(row.error)
  if (row.activation != null) {
    rec.activation = row.activation as ExtensionRecord['activation']
  }
  try {
    const ev = JSON.parse(String(row.activation_events ?? '[]'))
    if (Array.isArray(ev) && ev.length > 0) rec.activationEvents = ev
  } catch {
    // corrupt field → default onStartup semantics
  }
  try {
    if (row.capabilities != null) {
      rec.capabilities = JSON.parse(String(row.capabilities))
    }
  } catch {
    // corrupt field → drop (fail-closed: missing capabilities never grant)
  }
  try {
    if (row.permissions != null) {
      const parsed = JSON.parse(String(row.permissions))
      if (Array.isArray(parsed)) rec.permissions = parsed
    }
  } catch {
    // corrupt field → drop (fail-closed: missing permissions deny capability use)
  }
  return rec
}

export function createExtensionRegistryStore(dbPath?: string): ExtensionRegistryStore {
  const file = dbPath ?? resolveRegistryDbPath()
  const dir = file.split('/').slice(0, -1).join('/')
  if (dir) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // best-effort; db open will fail loudly if truly broken
    }
  }

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  migrateSchema(db)

  const stmtInsert = db.prepare(`
    INSERT INTO extensions
      (id, state, name, version, capabilities, permissions, activation,
       activation_events, trusted, host_bound, js_loaded, error, entry_path,
       contributes, updated_at)
    VALUES
      (:id, :state, :name, :version, :capabilities, :permissions, :activation,
       :activation_events, :trusted, :host_bound, :js_loaded, :error,
       :entry_path, :contributes, :updated_at)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      name = excluded.name,
      version = excluded.version,
      capabilities = excluded.capabilities,
      permissions = excluded.permissions,
      activation = excluded.activation,
      activation_events = excluded.activation_events,
      trusted = excluded.trusted,
      host_bound = excluded.host_bound,
      js_loaded = excluded.js_loaded,
      error = excluded.error,
      entry_path = excluded.entry_path,
      contributes = excluded.contributes,
      updated_at = excluded.updated_at
  `)
  const stmtDelete = db.prepare('DELETE FROM extensions WHERE id = ?')
  const stmtSelectAll = db.prepare('SELECT * FROM extensions ORDER BY id')

  function persist(record: ExtensionRecord): void {
    stmtInsert.run({
      id: sanitizeId(record.id),
      state: record.state,
      name: record.name ?? null,
      version: record.version ?? null,
      capabilities: JSON.stringify(record.capabilities ?? []),
      permissions: JSON.stringify(record.permissions ?? []),
      activation: record.activation ?? 'catalog_only',
      activation_events: JSON.stringify(record.activationEvents ?? ['onStartup']),
      trusted: record.trusted ? 1 : 0,
      host_bound: record.hostBound ? 1 : 0,
      js_loaded: record.jsLoaded ? 1 : 0,
      error: record.error ?? null,
      entry_path: null,
      contributes: '{}',
      updated_at: new Date().toISOString(),
    })
  }

  function remove(id: string): void {
    stmtDelete.run(sanitizeId(id))
  }

  return {
    loadAll(): ExtensionRecord[] {
      const rows = stmtSelectAll.all() as Record<string, unknown>[]
      return rows.map(rowToRecord)
    },
    upsert(record: ExtensionRecord): void {
      persist(record)
    },
    remove(id: string): void {
      remove(id)
    },
    close(): void {
      try {
        db.close()
      } catch {
        // idempotent
      }
    },
  }
}

function resolveRegistryDbPath(): string {
  return resolveExtensionsDir() + '/registry.db'
}
