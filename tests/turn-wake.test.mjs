import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = join(import.meta.dirname, '..')

async function loadTurnWake() {
  // 优先 dist（build 后）；开发时可直读 ts 经已构建包
  const distUrl = pathToFileURL(join(repoRoot, 'packages/agent/dist/turn-wake.js')).href
  try {
    return await import(distUrl)
  } catch {
    // fallback：经 package export
    return await import('@opptrix/agent')
  }
}

describe('turn-wake', () => {
  /** @type {Awaited<ReturnType<typeof loadTurnWake>> | null} */
  let tw = null

  afterEach(() => {
    tw?.resetTurnWakeForTests?.()
    tw = null
  })

  it('clampWakeSeconds clamps to [5, 1800]', async () => {
    tw = await loadTurnWake()
    assert.equal(tw.clampWakeSeconds(1), 5)
    assert.equal(tw.clampWakeSeconds(5), 5)
    assert.equal(tw.clampWakeSeconds(90), 90)
    assert.equal(tw.clampWakeSeconds(1800), 1800)
    assert.equal(tw.clampWakeSeconds(99999), 1800)
    assert.equal(tw.clampWakeSeconds('12.9'), 12)
    assert.equal(tw.clampWakeSeconds(NaN), 5)
  })

  it('formatWakeMessage includes prompt and time metadata', async () => {
    tw = await loadTurnWake()
    const msg = tw.formatWakeMessage({
      id: 'wake-1',
      sessionId: 's1',
      prompt: '检查 dump 是否就绪并继续离线分析',
      seconds: 90,
      scheduledAt: '2026-08-14T00:00:00.000Z',
      fireAt: '2026-08-14T00:01:30.000Z',
      reason: 'waiting_fuyao_dump',
      jobId: 'job-abc',
    }, '2026-08-14T00:01:31.000Z')
    assert.match(msg, /【定时唤醒】/)
    assert.match(msg, /检查 dump 是否就绪并继续离线分析/)
    assert.match(msg, /wake_id: wake-1/)
    assert.match(msg, /scheduled_at: 2026-08-14T00:00:00\.000Z/)
    assert.match(msg, /fire_at: 2026-08-14T00:01:30\.000Z/)
    assert.match(msg, /delay_s: 90/)
    assert.match(msg, /fired_at: 2026-08-14T00:01:31\.000Z/)
    assert.match(msg, /reason: waiting_fuyao_dump/)
    assert.match(msg, /job_id: job-abc/)
  })

  it('scheduleTurnWake returns wake_id/fire_at/seconds and fires resume', async () => {
    tw = await loadTurnWake()
    /** @type {ReturnType<typeof setTimeout>[]} */
    const timers = []
    /** @type {Array<(...args: unknown[]) => void>} */
    const callbacks = []
    let now = 1_000_000
    /** @type {{ job: unknown, message: string } | null} */
    let resumed = null

    tw.configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
      now: () => now,
      setTimeout: (fn, ms) => {
        callbacks.push(fn)
        const id = setTimeout(() => {}, 60_000)
        timers.push(id)
        assert.ok(typeof ms === 'number' && ms >= 5000)
        return id
      },
      clearTimeout: (id) => clearTimeout(id),
    })
    tw.setTurnWakeResumeHandler(async (job, wakeMessage) => {
      resumed = { job, message: wakeMessage }
    })

    const r = tw.scheduleTurnWake({
      sessionId: 'sess-a',
      seconds: 3, // clamp → 5
      prompt: '续跑检查',
      reason: 'test',
      jobId: 'j1',
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.ok(r.wake_id)
    assert.equal(r.seconds, 5)
    assert.ok(r.fire_at)
    assert.equal(r.session_id, 'sess-a')
    assert.equal(tw.listTurnWakeIdsForTests('sess-a').length, 1)

    // 手动触发到期回调
    const cb = callbacks[0]
    assert.ok(cb)
    await cb()
    assert.ok(resumed)
    assert.match(resumed.message, /续跑检查/)
    assert.match(resumed.message, /wake_id:/)
    assert.equal(tw.listTurnWakeIdsForTests('sess-a').length, 0)

    for (const t of timers) clearTimeout(t)
  })

  it('defers when chat is busy instead of calling resume', async () => {
    tw = await loadTurnWake()
    let busy = true
    /** @type {Array<() => void>} */
    const callbacks = []
    let resumeCount = 0
    let now = 2_000_000

    tw.configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => busy,
      now: () => now,
      setTimeout: (fn) => {
        callbacks.push(fn)
        return setTimeout(() => {}, 60_000)
      },
      clearTimeout: (id) => clearTimeout(id),
    })
    tw.setTurnWakeResumeHandler(async () => {
      resumeCount += 1
    })

    const r = tw.scheduleTurnWake({
      sessionId: 'sess-busy',
      seconds: 5,
      prompt: '忙时延期',
    })
    assert.equal(r.ok, true)
    assert.equal(callbacks.length, 1)

    // 第一次到期：仍 busy → 延期再挂，不 resume
    await callbacks[0]()
    assert.equal(resumeCount, 0)
    assert.equal(tw.listTurnWakeIdsForTests('sess-busy').length, 1)
    assert.equal(callbacks.length, 2)

    // 第二次：空闲 → resume
    busy = false
    now += 10_000
    await callbacks[1]()
    assert.equal(resumeCount, 1)
    assert.equal(tw.listTurnWakeIdsForTests('sess-busy').length, 0)
  })

  it('clearSessionTurnWakes cancels timers; dead session drops on fire', async () => {
    tw = await loadTurnWake()
    /** @type {Array<() => void>} */
    const callbacks = []
    let resumeCount = 0
    let alive = true

    tw.configureTurnWakeRuntime({
      isSessionAlive: () => alive,
      isChatBusy: () => false,
      now: () => Date.now(),
      setTimeout: (fn) => {
        callbacks.push(fn)
        return setTimeout(() => {}, 60_000)
      },
      clearTimeout: (id) => clearTimeout(id),
    })
    tw.setTurnWakeResumeHandler(async () => {
      resumeCount += 1
    })

    tw.scheduleTurnWake({ sessionId: 's-del', seconds: 5, prompt: 'a' })
    tw.scheduleTurnWake({ sessionId: 's-del', seconds: 10, prompt: 'b' })
    assert.equal(tw.listTurnWakeIdsForTests('s-del').length, 2)
    const n = tw.clearSessionTurnWakes('s-del')
    assert.equal(n, 2)
    assert.equal(tw.listTurnWakeIdsForTests('s-del').length, 0)

    tw.scheduleTurnWake({ sessionId: 's-dead', seconds: 5, prompt: 'c' })
    alive = false
    await callbacks[callbacks.length - 1]()
    assert.equal(resumeCount, 0)
  })

  it('rejects empty prompt and session cap', async () => {
    tw = await loadTurnWake()
    tw.configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
    })
    const bad = tw.scheduleTurnWake({ sessionId: 's', seconds: 10, prompt: '  ' })
    assert.equal(bad.ok, false)

    for (let i = 0; i < tw.TURN_WAKE_MAX_PER_SESSION; i++) {
      const r = tw.scheduleTurnWake({ sessionId: 'cap', seconds: 60, prompt: `p${i}` })
      assert.equal(r.ok, true)
    }
    const over = tw.scheduleTurnWake({ sessionId: 'cap', seconds: 60, prompt: 'overflow' })
    assert.equal(over.ok, false)
  })

  it('estimateEtaFromProgress uses percent and bytes', async () => {
    tw = await loadTurnWake()
    const fromPct = tw.estimateEtaFromProgress({
      percent: 50,
      startedAtMs: Date.now() - 60_000,
      heuristicDefaultSeconds: 999,
    })
    assert.ok(fromPct > 30 && fromPct < 200)

    const fromBytes = tw.estimateEtaFromProgress({
      bytesDownloaded: 50_000_000,
      bytesTotal: 100_000_000,
      startedAtMs: Date.now() - 50_000,
    })
    assert.ok(fromBytes > 20)

    const heuristic = tw.estimateEtaFromProgress({
      percent: 1,
      heuristicDefaultSeconds: 120,
    })
    assert.equal(heuristic, 120)
  })

  it('listPendingTurnWakes returns seconds_left and clearSession removes them', async () => {
    tw = await loadTurnWake()
    let now = 5_000_000
    tw.configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
      now: () => now,
      setTimeout: (fn) => setTimeout(fn, 60_000),
      clearTimeout: (id) => clearTimeout(id),
    })
    const r = tw.scheduleTurnWake({
      sessionId: 's-list',
      seconds: 90,
      prompt: '列表检查',
      reason: 'wait_dump',
    })
    assert.equal(r.ok, true)
    const pending = tw.listPendingTurnWakes('s-list', now)
    assert.equal(pending.length, 1)
    assert.equal(pending[0].seconds_left, 90)
    assert.equal(pending[0].reason, 'wait_dump')
    assert.ok(pending[0].wake_id)
    assert.ok(pending[0].fire_at)

    now += 30_000
    const later = tw.listPendingTurnWakes('s-list', now)
    assert.equal(later[0].seconds_left, 60)

    const n = tw.clearSessionTurnWakes('s-list')
    assert.equal(n, 1)
    assert.equal(tw.listPendingTurnWakes('s-list', now).length, 0)
  })
})
