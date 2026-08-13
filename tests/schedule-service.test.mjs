/**
 * ScheduleService — next_run / tick / master switch
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function withStore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-sched-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = dir
  const { UserDataStore } = await import('../packages/user-store/dist/index.js')
  const { ScheduleService, computeNextRunAt, nextCronOccurrence } = await import('../packages/schedule/dist/index.js')
  // reset singleton
  try { UserDataStore.getInstance().close() } catch { /* */ }
  const store = UserDataStore.getInstance()
  try {
    await fn({ store, ScheduleService, computeNextRunAt, nextCronOccurrence })
  } finally {
    store.close()
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('computeNextRunAt interval', async () => {
  await withStore(async ({ computeNextRunAt }) => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const next = computeNextRunAt('interval', { every_sec: 60, anchor: '2026-01-01T00:00:00.000Z' }, from)
    assert.equal(next, '2026-01-01T00:01:00.000Z')
  })
})

test('computeNextRunAt once past returns null', async () => {
  await withStore(async ({ computeNextRunAt }) => {
    const from = new Date('2026-01-02T00:00:00.000Z')
    const next = computeNextRunAt('once', { run_at: '2026-01-01T00:00:00.000Z' }, from)
    assert.equal(next, null)
  })
})

test('schema init is idempotent with meta flag', async () => {
  await withStore(async ({ store }) => {
    assert.equal(store.getMetaFlag('schedule_schema_v1'), true)
    const { initScheduleSchema } = await import('../packages/user-store/dist/schedule.js')
    // re-init must not throw
    const Database = (await import('better-sqlite3')).default
    const dbPath = path.join(process.env.OPPTRIX_DATA_DIR, 'opptrix.db')
    const db = new Database(dbPath)
    initScheduleSchema(db)
    initScheduleSchema(db)
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('scheduled_jobs','scheduled_job_runs')",
    ).all()
    assert.equal(tables.length, 2)
    db.close()
  })
})

test('cron next occurrence', async () => {
  await withStore(async ({ nextCronOccurrence }) => {
    const from = new Date('2026-01-01T10:00:00.000Z')
    const n = nextCronOccurrence('0 * * * *', from)
    assert.ok(n instanceof Date)
    assert.ok(n.getTime() > from.getTime())
  })
})

test('master switch skips tick', async () => {
  await withStore(async ({ store, ScheduleService }) => {
    const svc = new ScheduleService(store, async () => ({ summary: 'ok' }))
    svc.patchSettings({ master_enabled: false })
    store.schedule.createJob({
      title: 't',
      kind: 'agent_prompt',
      schedule_kind: 'interval',
      schedule: { every_sec: 60 },
      payload: { prompt: 'hello' },
    }, new Date(Date.now() - 1000).toISOString())
    const result = await svc.tick({ trigger: 'timer' })
    assert.deepEqual(result.due, [])
    assert.deepEqual(result.ran, [])
  })
})

test('tick runs due job once and advances next_run', async () => {
  await withStore(async ({ store, ScheduleService }) => {
    let calls = 0
    const svc = new ScheduleService(store, async () => {
      calls += 1
      return { summary: 'done' }
    })
    svc.patchSettings({ master_enabled: true })
    store.schedule.createJob({
      title: 't',
      kind: 'agent_prompt',
      schedule_kind: 'interval',
      schedule: { every_sec: 60 },
      payload: { prompt: 'hello' },
    }, new Date(Date.now() - 1000).toISOString())
    const r1 = await svc.tick({ trigger: 'timer' })
    assert.equal(r1.ran.length, 1)
    // wait queue
    await new Promise(r => setTimeout(r, 50))
    assert.equal(calls, 1)
    const job = svc.listJobs()[0]
    assert.ok(job.next_run_at)
    const r2 = await svc.tick({ trigger: 'timer' })
    assert.equal(r2.ran.length, 0)
  })
})

test('stale running lease is reconciled so claim can succeed again', async () => {
  await withStore(async ({ store }) => {
    const Database = (await import('better-sqlite3')).default
    const dueAt = new Date(Date.now() - 1000).toISOString()
    const job = store.schedule.createJob({
      title: 'stale-lease',
      kind: 'agent_prompt',
      schedule_kind: 'interval',
      schedule: { every_sec: 60 },
      payload: { prompt: 'hello' },
    }, dueAt)

    const stuck = store.schedule.startRun(job.id, 'timer')
    assert.equal(store.schedule.listActiveRunsForJob(job.id).length, 1)

    const staleStarted = new Date(Date.now() - 50 * 60 * 1000).toISOString()
    const db = new Database(path.join(process.env.OPPTRIX_DATA_DIR, 'opptrix.db'))
    db.prepare('UPDATE scheduled_job_runs SET started_at = ? WHERE id = ?').run(staleStarted, stuck.id)
    db.close()

    // fresh claim must fail while lease is active without reconcile of non-stale;
    // after backdating past SCHEDULE_STALE_RUN_MS, tryClaim reconciles then succeeds
    const freshJob = store.schedule.getJob(job.id)
    assert.ok(freshJob)
    const nowIso = new Date().toISOString()
    const leaseUntil = new Date(Date.now() + 60_000).toISOString()
    const claimed = store.schedule.tryClaimDueJob(freshJob, nowIso, leaseUntil, 'timer')
    assert.ok(claimed, 'claim should succeed after stale lease reconcile')
    assert.equal(claimed.status, 'running')
    assert.notEqual(claimed.id, stuck.id)

    const interrupted = store.schedule.listRuns(job.id, 10).filter((r) => r.status === 'interrupted')
    assert.equal(interrupted.length, 1)
    assert.equal(interrupted[0].id, stuck.id)
    assert.equal(store.schedule.listActiveRunsForJob(job.id).length, 1)
  })
})

test('pruneJobRuns keeps at most K recent runs per job', async () => {
  await withStore(async ({ store }) => {
    const job = store.schedule.createJob({
      title: 'prune',
      kind: 'agent_prompt',
      schedule_kind: 'interval',
      schedule: { every_sec: 60 },
      payload: { prompt: 'hello' },
    }, new Date().toISOString())

    for (let i = 0; i < 15; i += 1) {
      const run = store.schedule.startRun(job.id, 'timer')
      store.schedule.finishRun(run.id, { status: 'ok', summary: `n=${i}` })
    }

    assert.equal(store.schedule.listRuns(job.id, 50).length, 15)
    const deleted = store.schedule.pruneJobRuns(job.id, 5)
    assert.equal(deleted, 10)
    const keep = store.schedule.listRuns(job.id, 20)
    assert.equal(keep.length, 5)
    // 最近插入的 5 条（rowid 最大）应保留
    const summaries = keep.map((r) => r.summary).sort()
    assert.deepEqual(summaries, ['n=10', 'n=11', 'n=12', 'n=13', 'n=14'])
  })
})
