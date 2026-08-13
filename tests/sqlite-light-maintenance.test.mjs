import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const {
  runSqliteLightMaintenance,
  isSqliteLightMaintenanceDue,
  writeSqliteLightMaintenanceStamp,
  readSqliteLightMaintenanceStamp,
  resolveSqliteVacuumEnabled,
  DEFAULT_SQLITE_LIGHT_MAINTENANCE_INTERVAL_MS,
} = await import('../packages/shared/dist/sqlite-light-maintenance.js')

const VACUUM_ENV = 'OPPTRIX_SQLITE_VACUUM'
const prevVacuum = process.env[VACUUM_ENV]

afterEach(() => {
  if (prevVacuum === undefined) delete process.env[VACUUM_ENV]
  else process.env[VACUUM_ENV] = prevVacuum
})

describe('sqlite light maintenance', () => {
  it('resolveSqliteVacuumEnabled defaults off', () => {
    delete process.env[VACUUM_ENV]
    assert.equal(resolveSqliteVacuumEnabled({}), false)
    assert.equal(resolveSqliteVacuumEnabled({ [VACUUM_ENV]: '1' }), true)
    assert.equal(resolveSqliteVacuumEnabled({}, true), true)
    assert.equal(resolveSqliteVacuumEnabled({ [VACUUM_ENV]: '1' }, false), false)
  })

  it('wal_checkpoint on temp WAL db without vacuum by default', () => {
    delete process.env[VACUUM_ENV]
    const dir = mkdtempSync(join(tmpdir(), 'opptrix-sqlite-light-'))
    const dbPath = join(dir, 't.db')
    try {
      const db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
      db.prepare('INSERT INTO t (v) VALUES (?)').run('a')
      const result = runSqliteLightMaintenance(db, { allowVacuum: false })
      assert.equal(result.vacuum, false)
      assert.equal(result.walCheckpoint, true)
      assert.ok(result.autoVacuum === 'none' || result.autoVacuum === 'unknown')
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('incremental_vacuum when auto_vacuum=INCREMENTAL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opptrix-sqlite-incr-'))
    const dbPath = join(dir, 't.db')
    try {
      // auto_vacuum 必须在建表前设置
      const db = new Database(dbPath)
      db.pragma('auto_vacuum = INCREMENTAL')
      db.pragma('journal_mode = WAL')
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
      for (let i = 0; i < 50; i++) {
        db.prepare('INSERT INTO t (v) VALUES (?)').run(`row-${i}`)
      }
      db.exec('DELETE FROM t')
      const result = runSqliteLightMaintenance(db, { allowVacuum: false, incrementalPages: 128 })
      assert.equal(result.autoVacuum, 'incremental')
      assert.equal(result.incrementalVacuum, true)
      assert.equal(result.walCheckpoint, true)
      assert.equal(result.vacuum, false)
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stamp due / interval gating', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opptrix-sqlite-stamp-'))
    const stampPath = join(dir, 'sqlite-light-maintenance.json')
    try {
      assert.equal(isSqliteLightMaintenanceDue({ stampPath, nowMs: 1_000_000 }), true)
      writeSqliteLightMaintenanceStamp(1_000_000, stampPath)
      assert.ok(existsSync(stampPath))
      assert.equal(readSqliteLightMaintenanceStamp(stampPath).lastRunAtMs, 1_000_000)
      assert.equal(
        isSqliteLightMaintenanceDue({
          stampPath,
          nowMs: 1_000_000 + DEFAULT_SQLITE_LIGHT_MAINTENANCE_INTERVAL_MS - 1,
          intervalMs: DEFAULT_SQLITE_LIGHT_MAINTENANCE_INTERVAL_MS,
        }),
        false,
      )
      assert.equal(
        isSqliteLightMaintenanceDue({
          stampPath,
          nowMs: 1_000_000 + DEFAULT_SQLITE_LIGHT_MAINTENANCE_INTERVAL_MS,
          intervalMs: DEFAULT_SQLITE_LIGHT_MAINTENANCE_INTERVAL_MS,
        }),
        true,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('allowVacuum runs VACUUM when opted in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opptrix-sqlite-vac-'))
    const dbPath = join(dir, 't.db')
    try {
      const db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
      db.prepare('INSERT INTO t (v) VALUES (?)').run('x')
      const result = runSqliteLightMaintenance(db, { allowVacuum: true })
      assert.equal(result.vacuum, true)
      assert.equal(result.walCheckpoint, true)
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
