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
