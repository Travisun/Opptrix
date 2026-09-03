/**
 * Pure autostart helpers (no Docker required).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DESIRED_RESTART_POLICY,
  isRestartPolicyOk,
} from '../packages/selfhost/src/autostart.mjs'

test('isRestartPolicyOk accepts unless-stopped and always', () => {
  assert.equal(isRestartPolicyOk('unless-stopped'), true)
  assert.equal(isRestartPolicyOk('always'), true)
  assert.equal(isRestartPolicyOk('Unless-Stopped'), true)
  assert.equal(isRestartPolicyOk('ALWAYS'), true)
})

test('isRestartPolicyOk rejects empty / no / on-failure', () => {
  assert.equal(isRestartPolicyOk(''), false)
  assert.equal(isRestartPolicyOk(null), false)
  assert.equal(isRestartPolicyOk(undefined), false)
  assert.equal(isRestartPolicyOk('no'), false)
  assert.equal(isRestartPolicyOk('on-failure'), false)
  assert.equal(isRestartPolicyOk('on-failure:5'), false)
})

test('DESIRED_RESTART_POLICY is unless-stopped', () => {
  assert.equal(DESIRED_RESTART_POLICY, 'unless-stopped')
  assert.equal(isRestartPolicyOk(DESIRED_RESTART_POLICY), true)
})
