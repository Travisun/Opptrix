/**
 * provider_recommended_display_order_v1 — 按推荐栈回写 sortOrder；幂等。
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
  PROVIDER_RECOMMENDED_DISPLAY_ORDER_KEY,
} from '../packages/user-store/dist/provider-settings.js'
import { RECOMMENDED_PROVIDER_DISPLAY_ORDER } from '../packages/shared/dist/index.js'

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-rec-order-'))
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

test('migration writes recommended sortOrder for existing built-ins', () => {
  const { db, dir, repo, hasMigration, markMigration } = tmpDb()
  try {
    // 旧脏序：tushare 在前，缺 stockindex 行
    repo.save('tushare', { enabled: true, sortOrder: 0, extra: {} })
    repo.save('tonghuashun', { enabled: true, sortOrder: 10, extra: {} })
    repo.save('tickflow', { enabled: true, sortOrder: 20, extra: {} })

    repo.migrateRecommendedProviderDisplayOrder(hasMigration, markMigration)

    assert.equal(repo.get('tonghuashun')?.sortOrder, 0)
    assert.equal(repo.get('tickflow')?.sortOrder, 20)
    assert.equal(repo.get('tushare')?.sortOrder, 30)
    assert.equal(repo.get('stockindex'), null)
    assert.equal(hasMigration(PROVIDER_RECOMMENDED_DISPLAY_ORDER_KEY), true)
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('migration is idempotent and does not overwrite later drag order', () => {
  const { db, dir, repo, hasMigration, markMigration } = tmpDb()
  try {
    for (const id of RECOMMENDED_PROVIDER_DISPLAY_ORDER) {
      repo.save(id, { enabled: true, extra: {} })
    }
    repo.migrateRecommendedProviderDisplayOrder(hasMigration, markMigration)
    assert.equal(repo.get('stockindex')?.sortOrder, 10)

    repo.save('stockindex', { sortOrder: 99 })
    repo.migrateRecommendedProviderDisplayOrder(hasMigration, markMigration)
    assert.equal(repo.get('stockindex')?.sortOrder, 99)
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
