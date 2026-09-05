/**
 * Registry schema migration tests — registry.db files created by older
 * builds lack newer columns (CREATE TABLE IF NOT EXISTS never alters an
 * existing table). The store must migrate them in place (idempotent) so
 * persistence keeps working across version upgrades.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import Database from 'better-sqlite3'

const here = path.dirname(fileURLToPath(import.meta.url))
const storeModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/extensions/registry-store.js'),
).href

let tmpRoot
let dbPath
let store

function createLegacyDb() {
  // Exact schema of the FIRST release (before activation_events etc.).
  const legacy = `
  CREATE TABLE extensions (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'inactive',
    name TEXT,
    version TEXT,
    capabilities TEXT NOT NULL DEFAULT '[]',
    activation TEXT NOT NULL DEFAULT 'catalog_only',
    trusted INTEGER NOT NULL DEFAULT 0,
    host_bound INTEGER NOT NULL DEFAULT 0,
    js_loaded INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    entry_path TEXT,
    contributes TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );`
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.exec(legacy)
  db.prepare(
    `INSERT INTO extensions (id, state, capabilities, activation, trusted, updated_at)
     VALUES ('legacy.ext', 'active', '[]', 'catalog_only', 1, ?)`,
  ).run(new Date().toISOString())
  db.close()
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-regmig-'))
  dbPath = path.join(tmpRoot, 'registry.db')
})

afterEach(() => {
  try {
    store?.close()
  } catch {
    // best-effort
  }
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('registry schema migration', () => {
  it('adds missing columns to a legacy db and keeps rows intact', async () => {
    createLegacyDb()
    const { createExtensionRegistryStore } = await import(`${storeModUrl}?t=${Date.now()}`)
    store = createExtensionRegistryStore(dbPath)

    const loaded = store.loadAll()
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].id, 'legacy.ext')

    // Upsert works on the migrated schema (would throw before the migration).
    store.upsert({
      id: 'legacy.ext',
      state: 'active',
      trusted: true,
      permissions: ['storage'],
      activationEvents: ['onStartup'],
    })
    const rows = store.loadAll()
    assert.equal(rows[0].permissions?.[0], 'storage')
    assert.deepEqual(rows[0].activationEvents, ['onStartup'])
  })

  it('migration is idempotent (second open succeeds)', async () => {
    const { createExtensionRegistryStore } = await import(`${storeModUrl}?t=${Date.now()}`)
    store = createExtensionRegistryStore(dbPath)
    store.upsert({ id: 'a', state: 'inactive', trusted: true })
    store.close()
    store = null

    const second = createExtensionRegistryStore(dbPath)
    const loaded = second.loadAll()
    assert.equal(loaded.length, 1)
    second.close()
    store = null
  })

  it('fresh dbs are created with the full schema', async () => {
    const { createExtensionRegistryStore } = await import(`${storeModUrl}?t=${Date.now()}`)
    store = createExtensionRegistryStore(dbPath)
    store.upsert({
      id: 'fresh.1',
      state: 'inactive',
      trusted: true,
      permissions: ['storage'],
    })
    const db = new Database(dbPath, { readonly: true })
    const cols = db
      .prepare('PRAGMA table_info(extensions)')
      .all()
      .map((c) => c.name)
    assert.ok(cols.includes('activation_events'))
    assert.ok(cols.includes('permissions'))
    db.close()
  })
})
