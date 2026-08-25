/**
 * tickflow_public_free_default_enabled_v1 — 无 Key 默认开启；幂等。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  ProviderSettingsRepository,
  initProviderSettingsSchema,
  TICKFLOW_PUBLIC_FREE_DEFAULT_ENABLED_KEY,
} from '../packages/user-store/dist/provider-settings.js'

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tf-mig-'))
  const dbPath = path.join(dir, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  initProviderSettingsSchema(db)
  const meta = new Map()
  const hasMigration = (key) => meta.get(key) === '1'
  const markMigration = (key) => { meta.set(key, '1') }
  const repo = new ProviderSettingsRepository(db)
  return { db, dir, repo, hasMigration, markMigration, meta }
}

test('migration inserts enabled=true when no tickflow row', () => {
  const { db, dir, repo, hasMigration, markMigration } = tmpDb()
  try {
    assert.equal(repo.get('tickflow'), null)
    repo.migrateTickflowPublicFreeDefaultEnabled(hasMigration, markMigration)
    const row = repo.get('tickflow')
    assert.ok(row)
    assert.equal(row.enabled, true)
    assert.deepEqual(row.extra, {})
    assert.equal(hasMigration(TICKFLOW_PUBLIC_FREE_DEFAULT_ENABLED_KEY), true)
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('migration flips enabled=false without apiKey to true', () => {
  const { db, dir, repo, hasMigration, markMigration } = tmpDb()
  try {
    repo.save('tickflow', { enabled: false, priorityMode: 'manifest', extra: {} })
    repo.migrateTickflowPublicFreeDefaultEnabled(hasMigration, markMigration)
    assert.equal(repo.get('tickflow')?.enabled, true)
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('migration keeps enabled when apiKey present', () => {
  const { db, dir, repo, hasMigration, markMigration } = tmpDb()
  try {
    repo.save('tickflow', {
      enabled: false,
      priorityMode: 'manifest',
      extra: { apiKey: 'user-key' },
    })
    repo.migrateTickflowPublicFreeDefaultEnabled(hasMigration, markMigration)
    const row = repo.get('tickflow')
    assert.equal(row?.enabled, false)
    assert.equal(String(row?.extra.apiKey), 'user-key')
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('migration is idempotent', () => {
  const { db, dir, repo, hasMigration, markMigration } = tmpDb()
  try {
    repo.save('tickflow', { enabled: false, extra: {} })
    repo.migrateTickflowPublicFreeDefaultEnabled(hasMigration, markMigration)
    assert.equal(repo.get('tickflow')?.enabled, true)
    repo.save('tickflow', { enabled: false })
    repo.migrateTickflowPublicFreeDefaultEnabled(hasMigration, markMigration)
    // 已标记迁移，不再翻转用户后续关闭
    assert.equal(repo.get('tickflow')?.enabled, false)
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
