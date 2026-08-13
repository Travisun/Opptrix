import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'

const {
  applySqliteMemoryPragmas,
  resolveSqliteMemProfile,
  sqliteMemoryPragmaValues,
} = await import('../packages/shared/dist/sqlite-memory-pragmas.js')

const ENV_KEY = 'OPPTRIX_SQLITE_MEM_PROFILE'
const prevEnv = process.env[ENV_KEY]

afterEach(() => {
  if (prevEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = prevEnv
})

describe('sqlite memory pragmas', () => {
  it('resolveSqliteMemProfile honors env over totalmem', () => {
    assert.equal(resolveSqliteMemProfile({ [ENV_KEY]: 'low' }, 64 * 1024 ** 3), 'low')
    assert.equal(resolveSqliteMemProfile({ [ENV_KEY]: 'HIGH' }, 1 * 1024 ** 3), 'high')
    assert.equal(resolveSqliteMemProfile({ [ENV_KEY]: 'medium' }, 2 * 1024 ** 3), 'medium')
  })

  it('resolveSqliteMemProfile buckets by totalmem when env unset', () => {
    assert.equal(resolveSqliteMemProfile({}, 4 * 1024 ** 3), 'low')
    assert.equal(resolveSqliteMemProfile({}, 8 * 1024 ** 3), 'medium')
    assert.equal(resolveSqliteMemProfile({}, 16 * 1024 ** 3), 'high')
  })

  it('sqliteMemoryPragmaValues maps low/medium/high budgets', () => {
    const low = sqliteMemoryPragmaValues('low', 'write')
    assert.equal(low.cacheSizeKb, -8_192)
    assert.equal(low.mmapSize, 0)
    assert.equal(low.tempStore, 'FILE')

    const med = sqliteMemoryPragmaValues('medium', 'write')
    assert.equal(med.cacheSizeKb, -32_768)
    assert.equal(med.mmapSize, 32 * 1024 * 1024)
    assert.equal(med.tempStore, 'MEMORY')

    const highRead = sqliteMemoryPragmaValues('high', 'read')
    assert.equal(highRead.cacheSizeKb, -32_768)
    assert.equal(highRead.mmapSize, 32 * 1024 * 1024)
  })

  it('applySqliteMemoryPragmas forces low via env on :memory: db', () => {
    process.env[ENV_KEY] = 'low'
    const db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    const applied = applySqliteMemoryPragmas(db, 'write')
    assert.equal(applied.profile, 'low')
    assert.equal(applied.mmapSize, 0)
    assert.equal(Number(db.pragma('cache_size', { simple: true })), -8_192)
    // :memory: 上 mmap_size 查询可能为空；以 helper 返回值 + cache/temp 为准
    assert.equal(Number(db.pragma('temp_store', { simple: true })), 1)
    db.close()
  })
})

describe('sqlite memory pragmas + WAL on temp file', () => {
  it('keeps WAL after memory pragmas', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'opptrix-sqlite-mem-'))
    const path = join(dir, 't.db')
    try {
      process.env[ENV_KEY] = 'high'
      const db = new Database(path)
      db.pragma('journal_mode = WAL')
      db.pragma('busy_timeout = 5000')
      applySqliteMemoryPragmas(db, 'write', { profile: 'high' })
      assert.equal(String(db.pragma('journal_mode', { simple: true })).toLowerCase(), 'wal')
      assert.equal(Number(db.pragma('busy_timeout', { simple: true })), 5000)
      assert.equal(Number(db.pragma('cache_size', { simple: true })), -65_536)
      assert.equal(Number(db.pragma('mmap_size', { simple: true })), 64 * 1024 * 1024)
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
