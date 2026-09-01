/**
 * blockedVersions helpers + main DB snapshot roundtrip.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { after, before, describe, it } from 'node:test'

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

/** @type {string} */
let tmpRoot
/** @type {string} */
let systemDir
/** @type {string | undefined} */
let prevSystemDir

before(async () => {
  su = await import('../packages/system-update/dist/index.js')
})

describe('blocked version helpers', () => {
  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-block-'))
    systemDir = path.join(tmpRoot, 'system')
    prevSystemDir = process.env.OPPTRIX_SYSTEM_DIR
    process.env.OPPTRIX_SYSTEM_DIR = systemDir
    su.ensureLayout(systemDir)
  })

  after(() => {
    if (prevSystemDir === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prevSystemDir
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('compareSemver orders versions', () => {
    assert.equal(su.compareSemver('2.0.0', '1.9.9'), 1)
    assert.equal(su.compareSemver('1.0.0', '1.0.0'), 0)
    assert.equal(su.compareSemver('1.0.1', '1.0.2'), -1)
  })

  it('blockVersion records failed target and clears matching pending', () => {
    su.patchState({
      pendingVersion: '2.0.0',
      uiPhase: 'normal',
    }, systemDir)

    su.blockVersion('2.0.0', 'migrate failed', systemDir)
    const state = su.readState(systemDir)
    assert.deepEqual(state.blockedVersions, ['2.0.0'])
    assert.equal(state.lastBlockedReason, 'migrate failed')
    assert.equal(state.pendingVersion, null)
    assert.equal(state.uiPhase, 'normal')
    assert.equal(su.isVersionBlocked(state, '2.0.0'), true)
  })

  it('shouldOfferLatestVersion skips blocked and stale latest', () => {
    su.patchState({
      currentVersion: '1.0.0',
      blockedVersions: ['2.0.0'],
    }, systemDir)
    const state = su.readState(systemDir)

    assert.equal(su.shouldOfferLatestVersion(state, '1.0.0', '1.0.0'), false)
    assert.equal(su.shouldOfferLatestVersion(state, '2.0.0', '1.0.0'), false)
    assert.equal(su.shouldOfferLatestVersion(state, '2.1.0', '1.0.0'), true)
  })

  it('clearBlockedUpTo removes entries at or below success version', () => {
    su.patchState({
      blockedVersions: ['1.1.0', '2.0.0', '2.1.0'],
      lastBlockedReason: 'old',
    }, systemDir)

    su.clearBlockedUpTo('2.0.0', systemDir)
    const state = su.readState(systemDir)
    assert.deepEqual(state.blockedVersions, ['2.1.0'])
    assert.equal(state.lastBlockedReason, 'old')
  })
})

describe('main DB snapshot roundtrip', () => {
  /** @type {string} */
  let dbTmp

  before(() => {
    dbTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-db-'))
  })

  after(() => {
    fs.rmSync(dbTmp, { recursive: true, force: true })
  })

  it('snapshots and restores sqlite main + wal sidecars', () => {
    const dbPath = path.join(dbTmp, 'live', su.MAIN_DB_BASENAME)
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    const db = new Database(dbPath)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
    db.prepare('INSERT INTO t (v) VALUES (?)').run('before-upgrade')
    db.close()

    const walPath = `${dbPath}-wal`
    fs.writeFileSync(walPath, 'wal-stub')

    const dataFiles = su.collectSqliteDataFiles(dbPath)
    assert.ok(dataFiles.includes(dbPath))
    assert.ok(dataFiles.includes(walPath))

    const snapshotDir = path.join(dbTmp, 'snap', '1.0.0-to-2.0.0')
    const manifest = su.snapshotMainDatabase({ dataFiles, snapshotDir })
    assert.deepEqual(manifest.files.sort(), ['opptrix.db', 'opptrix.db-wal'].sort())
    assert.ok(fs.existsSync(path.join(snapshotDir, 'manifest.json')))

    const db2 = new Database(dbPath)
    db2.exec('DELETE FROM t')
    db2.prepare('INSERT INTO t (v) VALUES (?)').run('after-failure')
    db2.close()

    su.restoreMainDatabase({ snapshotDir, dataFiles: su.collectSqliteDataFiles(dbPath) })

    const db3 = new Database(dbPath, { readonly: true })
    const row = db3.prepare('SELECT v FROM t WHERE id = 1').get()
    db3.close()
    assert.deepEqual(row, { v: 'before-upgrade' })
    assert.ok(fs.existsSync(path.join(snapshotDir, 'opptrix.db-wal')))
  })

  it('dbSnapshotDir resolves under system update layout', () => {
    const dir = su.dbSnapshotDir(systemDir, '1.0.0', '2.0.0')
    assert.equal(
      dir,
      path.join(systemDir, 'update', 'db-snapshots', '1.0.0-to-2.0.0'),
    )
  })
})

describe('service packageReadyFrom with blocked pending', () => {
  it('treats blocked pending as not ready', async () => {
    const svc = await import('../apps/server/dist/system-update-service.js')
    const state = {
      currentVersion: '1.0.0',
      pendingVersion: '2.0.0',
      backupVersion: '1.0.0',
      uiPhase: 'normal',
      firstBootUpgrade: null,
      blockedVersions: ['2.0.0'],
      updatedAt: new Date().toISOString(),
    }
    assert.equal(svc.packageReadyFrom(state), false)
    assert.equal(svc.readyToApplyFrom(state), false)
    const status = svc.buildSystemUpdateStatus(state)
    assert.equal(status.updateBlocked, true)
    assert.equal(status.readyToApply, false)
    assert.deepEqual(status.blockedVersions, ['2.0.0'])
  })
})
