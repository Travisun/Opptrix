/**
 * Schedule OS sync — in-process only; register_tick forever false semantics
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

async function withStore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-os-sync-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = dir
  const { UserDataStore } = await import('../packages/user-store/dist/index.js')
  const {
    ScheduleService,
    computeOsHealth,
    resyncOsRegistration,
  } = await import('../packages/schedule/dist/index.js')
  try { UserDataStore.getInstance().close() } catch { /* */ }
  const store = UserDataStore.getInstance()
  try {
    await fn({ store, ScheduleService, computeOsHealth, resyncOsRegistration })
  } finally {
    store.close()
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('run_when_closed coerced false even if patched true', async () => {
  await withStore(async ({ store }) => {
    const next = store.schedule.patchSettings({ run_when_closed: true, master_enabled: true })
    assert.equal(next.run_when_closed, false)
    assert.equal(store.schedule.getSettings().run_when_closed, false)
  })
})

test('computeOsHealth never wants OS tick; tray messaging', async () => {
  await withStore(async ({ store, computeOsHealth }) => {
    store.schedule.patchSettings({ master_enabled: true, autostart: false })
    const health = computeOsHealth(store.schedule.getSettings(), [])
    assert.equal(health.status, 'n/a')
    assert.match(health.message, /托盘|运行/)
    assert.doesNotMatch(health.message, /关闭应用后仍/)
  })
})

test('resyncOsRegistration clears job os fields', async () => {
  await withStore(async ({ store, ScheduleService, resyncOsRegistration }) => {
    const svc = new ScheduleService(store, async () => ({ summary: 'ok' }))
    const job = svc.createJob({
      title: 't',
      kind: 'agent_prompt',
      schedule_kind: 'interval',
      schedule: { every_sec: 60 },
      payload: { prompt: 'hi' },
      enabled: true,
      os_status: 'synced',
      os_registration_id: 'legacy-id',
    })
    assert.equal(job.os_status, 'synced')
    const health = resyncOsRegistration(svc)
    assert.equal(health.status, 'n/a')
    const updated = svc.getJob(job.id)
    assert.ok(updated)
    assert.equal(updated.os_status, 'n/a')
    assert.equal(updated.os_registration_id, null)
    assert.equal(svc.getSettings().run_when_closed, false)
  })
})

test('purgeLegacyOsTickArtifacts removes runners and strips cold-start', async () => {
  const { purgeLegacyOsTickArtifacts, writeOsScheduleEndpoint, RUNNER_SH, ENDPOINT_FILENAME } =
    await import('../apps/desktop/electron/os-schedule/tick-runner.cjs')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-purge-tick-'))
  try {
    const runner = path.join(dir, RUNNER_SH)
    fs.writeFileSync(runner, '#!/bin/bash\n', 'utf8')
    writeOsScheduleEndpoint(dir, {
      host: '127.0.0.1',
      port: 8711,
      execPath: '/Applications/Opptrix.app/Contents/MacOS/OpptrixSchedule',
      headlessTick: '/tmp/headless-tick.cjs',
    })
    const result = purgeLegacyOsTickArtifacts(dir)
    assert.ok(result.removedRunners.includes(RUNNER_SH))
    assert.equal(result.endpointStripped, true)
    assert.equal(fs.existsSync(runner), false)
    const endpoint = JSON.parse(fs.readFileSync(path.join(dir, ENDPOINT_FILENAME), 'utf8'))
    assert.equal(endpoint.host, '127.0.0.1')
    assert.equal(endpoint.port, '8711')
    assert.equal(endpoint.execPath, undefined)
    assert.equal(endpoint.headlessTick, undefined)
    // idempotent
    const again = purgeLegacyOsTickArtifacts(dir)
    assert.deepEqual(again.removedRunners, [])
    assert.equal(again.endpointStripped, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
