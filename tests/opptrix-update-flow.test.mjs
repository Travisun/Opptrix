/**
 * Combined upgrade/rollback flow — user DB path must stay outside runtime slots.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, it, before, after } from 'node:test'

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

describe('runtime upgrade/rollback does not touch user private data path', () => {
  /** @type {string} */
  let tmpRoot
  /** @type {string} */
  let systemDir
  /** @type {string} */
  let privateDir
  /** @type {string | undefined} */
  let prevSystemDir
  /** @type {string | undefined} */
  let prevDataDir

  before(async () => {
    su = await import('../packages/system-update/dist/index.js')
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-flow-db-'))
    systemDir = path.join(tmpRoot, 'system')
    privateDir = path.join(tmpRoot, 'private')
    fs.mkdirSync(privateDir, { recursive: true })
    prevSystemDir = process.env.OPPTRIX_SYSTEM_DIR
    prevDataDir = process.env.OPPTRIX_DATA_DIR
    process.env.OPPTRIX_SYSTEM_DIR = systemDir
    process.env.OPPTRIX_DATA_DIR = privateDir
    process.env.OPPTRIX_DOCKER = '1'
    process.env.OPPTRIX_BASE_VERSION = 'opptrix-selfhost-v1.0.0'
  })

  after(() => {
    if (prevSystemDir === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prevSystemDir
    if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDataDir
    delete process.env.OPPTRIX_DOCKER
    delete process.env.OPPTRIX_BASE_VERSION
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('activate + rollback keeps private sqlite intact', async () => {
    const dbPath = path.join(privateDir, 'user-data.sqlite')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)')
    db.prepare('INSERT INTO notes (text) VALUES (?)').run('preserve-me')
    db.close()

    su.ensureLayout(systemDir)
    for (const ver of ['1.0.0', '1.1.0']) {
      const slot = su.slotPath(systemDir, ver)
      fs.mkdirSync(path.join(slot, 'apps', 'server', 'dist'), { recursive: true })
      fs.writeFileSync(path.join(slot, 'apps', 'server', 'dist', 'index.js'), `// v${ver}\n`)
      su.writeRuntimeMarker(slot, {
        version: ver,
        requires: { minBaseImage: 'opptrix-selfhost-v1.0.0' },
      })
    }
    su.pointBootToVersion(systemDir, '1.0.0')
    su.patchState({ currentVersion: '1.0.0' }, systemDir)

    su.setPendingVersion('1.1.0', systemDir)
    su.activatePending({ systemDir })
    await su.rollbackToBackup({ systemDir })

    const db2 = new Database(dbPath, { readonly: true })
    const row = db2.prepare('SELECT text FROM notes WHERE id = 1').get()
    db2.close()
    assert.equal(row?.text, 'preserve-me')
    assert.ok(fs.existsSync(dbPath))
    assert.ok(!fs.existsSync(path.join(systemDir, 'slots', '1.1.0', 'private')))
  })

  it('snapshot roundtrip for cross-version DB guard', () => {
    const from = '1.0.0'
    const to = '1.1.0'
    const dbPath = path.join(privateDir, 'user-data.sqlite')
    const snapDir = su.dbSnapshotDir(systemDir, from, to)
    su.snapshotMainDatabase({ dataFiles: [dbPath], snapshotDir: snapDir })
    assert.ok(fs.existsSync(path.join(snapDir, 'manifest.json')))
    const manifest = su.readDbSnapshotManifest(snapDir)
    assert.ok(manifest)
    assert.ok(manifest.files.some((f) => f.endsWith('user-data.sqlite') || f.includes('user-data')))
  })
})
