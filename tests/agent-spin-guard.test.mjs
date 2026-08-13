import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fingerprintToolCall,
  checkSpinGuard,
  recordSpinOutcome,
  noteRoundProgress,
  beginSpinRound,
  roundHadNewFingerprint,
  buildSpinGuardTurnTail,
  resetSpinGuardForTests,
  SPIN_GUARD_LIMITS,
  SPIN_POLL_TOOLS,
  isSpinPollTool,
  isInProgressJobStatus,
} from '../packages/agent/dist/loop/spin-guard.js'

test.beforeEach(() => {
  resetSpinGuardForTests()
})

test('fingerprint is stable under key order', () => {
  const a = fingerprintToolCall('get_x', { b: 1, a: 2 })
  const b = fingerprintToolCall('get_x', { a: 2, b: 1 })
  assert.equal(a, b)
})

test('fingerprint differs for different args', () => {
  const a = fingerprintToolCall('get_x', { code: '600519' })
  const b = fingerprintToolCall('get_x', { code: '000001' })
  assert.notEqual(a, b)
})

test('success repeat ≥3 blocks with spin_guard hint', () => {
  const sid = 's1'
  const args = { code: '600519' }
  for (let i = 0; i < SPIN_GUARD_LIMITS.SUCCESS_REPEAT_LIMIT; i++) {
    assert.equal(checkSpinGuard(sid, 'get_x', args), null)
    recordSpinOutcome(sid, 'get_x', args, { ok: true, data: i })
  }
  const blocked = checkSpinGuard(sid, 'get_x', args)
  assert.ok(blocked)
  assert.equal(blocked.spin_guard, true)
  assert.match(blocked.hint, /重复|成稿|换/)
  assert.match(buildSpinGuardTurnTail(sid), /路径提醒|重复/)
})

test('failure repeat ≥2 blocks', () => {
  const sid = 's2'
  const args = { q: 'news' }
  for (let i = 0; i < SPIN_GUARD_LIMITS.FAILURE_REPEAT_LIMIT; i++) {
    assert.equal(checkSpinGuard(sid, 'search_news', args), null)
    recordSpinOutcome(sid, 'search_news', args, { error: 'timeout' })
  }
  const blocked = checkSpinGuard(sid, 'search_news', args)
  assert.ok(blocked)
  assert.equal(blocked.spin_guard, true)
  assert.match(blocked.hint, /失败|路径|成稿/)
})

test('stale rounds without new fingerprint force close hint', () => {
  const sid = 's3'
  recordSpinOutcome(sid, 'get_x', { a: 1 }, { ok: true })
  const before = beginSpinRound(sid)
  // same fingerprint again — not new
  recordSpinOutcome(sid, 'get_x', { a: 1 }, { ok: true })
  assert.equal(roundHadNewFingerprint(sid, before), false)

  for (let i = 0; i < SPIN_GUARD_LIMITS.STALE_ROUNDS_WITHOUT_PROGRESS; i++) {
    noteRoundProgress(sid, { hadNewFingerprint: false, checklistProgressed: false })
  }
  assert.match(buildSpinGuardTurnTail(sid), /收口/)
})

test('SPIN_POLL_TOOLS and isInProgressJobStatus helpers', () => {
  assert.ok(SPIN_POLL_TOOLS.has('ensure_python'))
  assert.ok(SPIN_POLL_TOOLS.has('prepare_fuyao_dump'))
  assert.equal(isSpinPollTool('ensure_python'), true)
  assert.equal(isSpinPollTool('get_x'), false)
  assert.equal(isInProgressJobStatus({ status: 'Preparing' }), true)
  assert.equal(isInProgressJobStatus({ status: ' installing ' }), true)
  assert.equal(isInProgressJobStatus({ status: 'ready' }), false)
  assert.equal(isInProgressJobStatus({ ok: true }), false)
})

test('ensure_python preparing×5 same job_id does not block via SUCCESS_REPEAT', () => {
  const sid = 'poll-prep'
  const args = { job_id: 'job-1' }
  for (let i = 0; i < 5; i++) {
    assert.equal(checkSpinGuard(sid, 'ensure_python', args), null)
    recordSpinOutcome(sid, 'ensure_python', args, { status: 'preparing', job_id: 'job-1' })
  }
  assert.equal(checkSpinGuard(sid, 'ensure_python', args), null)
})

test('poll progress resets stale rounds (no force-close after preparing round)', () => {
  const sid = 'poll-stale'
  const args = { job_id: 'job-stale' }
  // Round 1: in-flight poll counts as progress
  recordSpinOutcome(sid, 'ensure_python', args, { status: 'preparing' })
  assert.equal(
    noteRoundProgress(sid, { hadNewFingerprint: false, checklistProgressed: false }),
    false,
  )
  // Next rounds without progress would accumulate — but after reset, need full STALE limit
  for (let i = 0; i < SPIN_GUARD_LIMITS.STALE_ROUNDS_WITHOUT_PROGRESS - 1; i++) {
    assert.equal(
      noteRoundProgress(sid, { hadNewFingerprint: false, checklistProgressed: false }),
      false,
    )
  }
  // One more preparing poll mid-way resets again
  recordSpinOutcome(sid, 'ensure_python', args, { status: 'installing' })
  assert.equal(
    noteRoundProgress(sid, { hadNewFingerprint: false, checklistProgressed: false }),
    false,
  )
  // Without further poll, still need STALE_ROUNDS full count from zero
  for (let i = 0; i < SPIN_GUARD_LIMITS.STALE_ROUNDS_WITHOUT_PROGRESS - 1; i++) {
    assert.equal(
      noteRoundProgress(sid, { hadNewFingerprint: false, checklistProgressed: false }),
      false,
    )
  }
  assert.equal(
    noteRoundProgress(sid, { hadNewFingerprint: false, checklistProgressed: false }),
    true,
  )
})

test('ensure_python ready success repeat ≥ SUCCESS_REPEAT_LIMIT still blocks', () => {
  const sid = 'poll-ready'
  const args = { job_id: 'job-ready' }
  for (let i = 0; i < SPIN_GUARD_LIMITS.SUCCESS_REPEAT_LIMIT; i++) {
    assert.equal(checkSpinGuard(sid, 'ensure_python', args), null)
    recordSpinOutcome(sid, 'ensure_python', args, { status: 'ready', ready: true })
  }
  const blocked = checkSpinGuard(sid, 'ensure_python', args)
  assert.ok(blocked)
  assert.equal(blocked.spin_guard, true)
  assert.match(blocked.hint, /重复|成稿|换/)
})

test('non-whitelist tool unchanged: preparing status still counts as success', () => {
  const sid = 'non-poll'
  const args = { id: 1 }
  for (let i = 0; i < SPIN_GUARD_LIMITS.SUCCESS_REPEAT_LIMIT; i++) {
    assert.equal(checkSpinGuard(sid, 'get_x', args), null)
    recordSpinOutcome(sid, 'get_x', args, { status: 'preparing', ok: true })
  }
  const blocked = checkSpinGuard(sid, 'get_x', args)
  assert.ok(blocked)
  assert.equal(blocked.spin_guard, true)
})

test('pollInFlight hard limit blocks whitelist tool', () => {
  const sid = 'poll-hard'
  const args = { job_id: 'job-hard' }
  const limit = SPIN_GUARD_LIMITS.POLL_IN_FLIGHT_HARD_LIMIT
  assert.ok(typeof limit === 'number' && limit > 0)
  for (let i = 0; i < limit; i++) {
    assert.equal(checkSpinGuard(sid, 'prepare_fuyao_dump', args), null)
    recordSpinOutcome(sid, 'prepare_fuyao_dump', args, { status: 'pending' })
  }
  const blocked = checkSpinGuard(sid, 'prepare_fuyao_dump', args)
  assert.ok(blocked)
  assert.equal(blocked.spin_guard, true)
  assert.match(blocked.hint, /卡住|轮询|进度/)
})
