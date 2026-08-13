import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import {
  MarketDataStore,
  SYNC_LOGS_GLOBAL_MAX,
  SYNC_LOGS_PER_SESSION_MAX,
  SYNC_SESSIONS_KEEP_MAX,
} from '../packages/market-data/dist/store.js'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opmd-sync-logs-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

function countLogs(store, sessionId = null) {
  if (sessionId != null) {
    return store.db.prepare('SELECT COUNT(*) AS c FROM sync_logs WHERE session_id = ?').get(sessionId).c
  }
  return store.db.prepare('SELECT COUNT(*) AS c FROM sync_logs').get().c
}

test('sync_logs prune constants are within expected hard-cap range', () => {
  assert.ok(SYNC_LOGS_GLOBAL_MAX >= 5000 && SYNC_LOGS_GLOBAL_MAX <= 10000)
  assert.ok(SYNC_LOGS_PER_SESSION_MAX >= 500 && SYNC_LOGS_PER_SESSION_MAX <= 5000)
  assert.ok(SYNC_LOGS_PER_SESSION_MAX <= SYNC_LOGS_GLOBAL_MAX)
})

test('pruneSyncLogsForSession deletes oldest rows beyond keepMax; getRecentLogs still works', () => {
  const dbPath = join(dataDir, 'session-prune.db')
  const store = new MarketDataStore(dbPath)
  const sessionId = store.beginSession('incremental', 1)

  for (let i = 0; i < 50; i++) {
    store.appendLog(sessionId, `msg-${i}`)
  }
  assert.equal(countLogs(store, sessionId), 50)

  const deleted = store.pruneSyncLogsForSession(sessionId, 20)
  assert.equal(deleted, 30)
  assert.equal(countLogs(store, sessionId), 20)

  const recent = store.getRecentLogs(sessionId, 500)
  assert.equal(recent.length, 20)
  assert.equal(recent[0], 'msg-30')
  assert.equal(recent[recent.length - 1], 'msg-49')

  // Under limit — no-op
  assert.equal(store.pruneSyncLogsForSession(sessionId, 20), 0)
  assert.equal(countLogs(store, sessionId), 20)

  store.finishSession(sessionId, 'completed')
  // finishSession also prunes; with defaults keepMax >> 20, count stays 20
  assert.equal(countLogs(store, sessionId), 20)
  assert.ok(store.getRecentLogs(sessionId, 10).length === 10)

  store.close()
})

test('pruneSyncLogsGlobal enforces hard cap across sessions', () => {
  const dbPath = join(dataDir, 'global-prune.db')
  const store = new MarketDataStore(dbPath)
  const a = store.beginSession('full', 1)
  const b = store.beginSession('incremental', 1)

  for (let i = 0; i < 30; i++) store.appendLog(a, `a-${i}`)
  for (let i = 0; i < 40; i++) store.appendLog(b, `b-${i}`)
  assert.equal(countLogs(store), 70)

  const deleted = store.pruneSyncLogsGlobal(25)
  assert.equal(deleted, 45)
  assert.equal(countLogs(store), 25)

  const recent = store.getRecentLogs(null, 100)
  assert.equal(recent.length, 25)
  // Newest rows belong to session b
  assert.ok(recent.every(m => m.startsWith('b-')))
  assert.equal(recent[0], 'b-15')
  assert.equal(recent[recent.length - 1], 'b-39')

  store.finishSession(a, 'completed')
  store.finishSession(b, 'completed')
  assert.ok(countLogs(store) <= SYNC_LOGS_GLOBAL_MAX)
  assert.ok(store.getRecentLogs(b, 5).length > 0)

  store.close()
})

test('sync_sessions prune constants are within expected hard-cap range', () => {
  assert.ok(SYNC_SESSIONS_KEEP_MAX >= 50 && SYNC_SESSIONS_KEEP_MAX <= 100)
})

test('pruneSyncSessions keeps newest N and cascades sync_logs; finishSession triggers', () => {
  const dbPath = join(dataDir, 'session-meta-prune.db')
  const store = new MarketDataStore(dbPath)

  const ids = []
  for (let i = 0; i < 12; i++) {
    const id = store.beginSession('incremental', 1)
    store.appendLog(id, `s${i}-log`)
    store.finishSession(id, 'completed')
    ids.push(id)
  }

  assert.equal(
    store.db.prepare('SELECT COUNT(*) AS c FROM sync_sessions').get().c,
    12,
  )

  const pruned = store.pruneSyncSessions(5)
  assert.equal(pruned.sessions, 7)
  assert.ok(pruned.logs >= 7)
  assert.equal(
    store.db.prepare('SELECT COUNT(*) AS c FROM sync_sessions').get().c,
    5,
  )
  assert.equal(countLogs(store), 5)

  const kept = store.db.prepare(
    'SELECT id FROM sync_sessions ORDER BY id ASC',
  ).all().map(r => r.id)
  assert.deepEqual(kept, ids.slice(-5))

  // Under limit — no-op
  assert.deepEqual(store.pruneSyncSessions(5), { sessions: 0, logs: 0 })

  // finishSession also prunes sessions (default keepMax >> 5)
  const extra = store.beginSession('full', 1)
  store.appendLog(extra, 'extra')
  store.finishSession(extra, 'completed')
  assert.ok(
    store.db.prepare('SELECT COUNT(*) AS c FROM sync_sessions').get().c
      <= SYNC_SESSIONS_KEEP_MAX,
  )

  store.close()
})
