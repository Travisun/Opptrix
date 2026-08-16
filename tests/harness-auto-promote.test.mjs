/**
 * Self-Harness Phase 3 — 自动晋升闸：A+ok+开 → promote_auto；B/关停/env → skip
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-harness-auto-'))
const prevData = process.env.OPPTRIX_DATA_DIR
const prevEnv = process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
process.env.OPPTRIX_DATA_DIR = tmp
delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE

const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
getUserDataStore().close()

const agent = await import('../packages/agent/dist/index.js')

const {
  runHarnessLab,
  rollbackHarnessToDefault,
  loadHarnessStore,
  setHarnessAutoPromote,
  isHarnessAutoPromoteEnabled,
  assertProposalSafe,
  validateProposalAgainstHeldOut,
  classifyVersionTier,
} = agent

function aProposal() {
  return {
    id: 'auto-a',
    createdAt: new Date().toISOString(),
    targetWeaknessCodes: ['tool_error'],
    summary: 'A 级取数纪律',
    patches: [
      {
        kind: 'skill_body_append',
        skillName: 'morning-market-brief',
        text: '\n## Auto A\n- 先取数再报价。\n',
      },
      {
        kind: 'route_hint_append',
        text: '价格问题优先行情工具',
      },
    ],
  }
}

function bProposal() {
  return {
    id: 'auto-b',
    createdAt: new Date().toISOString(),
    targetWeaknessCodes: ['tool_error'],
    summary: 'B 级替换',
    patches: [
      {
        kind: 'skill_body_replace_span',
        skillName: 'morning-market-brief',
        from: '旧句',
        to: '新句',
      },
    ],
  }
}

test('classify + validate A proposal ok', () => {
  const p = aProposal()
  assert.equal(classifyVersionTier(p.patches), 'A')
  assert.doesNotThrow(() => assertProposalSafe(p))
  const v = validateProposalAgainstHeldOut(p)
  assert.equal(v.ok, true)
  assert.equal(v.safetyVeto, false)
})

test('promote auto: A + ok + switch on → promote_auto audit', () => {
  rollbackHarnessToDefault()
  setHarnessAutoPromote(true)
  assert.equal(isHarnessAutoPromoteEnabled(), true)

  const out = runHarnessLab({ proposal: aProposal(), promote: 'auto' })
  assert.ok(out.promoted)
  assert.equal(out.promoted.tier, 'A')
  assert.equal(out.skipReason, undefined)
  const store = loadHarnessStore()
  assert.ok(store.auditLog.some(e => e.action === 'promote_auto'))
  rollbackHarnessToDefault()
})

test('promote auto: B does not auto-promote', () => {
  rollbackHarnessToDefault()
  setHarnessAutoPromote(true)
  const out = runHarnessLab({ proposal: bProposal(), promote: 'auto' })
  assert.equal(out.promoted, null)
  assert.match(out.skipReason ?? '', /tier_B/)
  const store = loadHarnessStore()
  assert.ok(store.auditLog.some(e => e.action === 'skip_auto_promote'))
})

test('promote auto: store switch off → skip', () => {
  rollbackHarnessToDefault()
  setHarnessAutoPromote(false)
  assert.equal(isHarnessAutoPromoteEnabled(), false)
  const out = runHarnessLab({ proposal: aProposal(), promote: 'auto' })
  assert.equal(out.promoted, null)
  assert.equal(out.skipReason, 'auto_promote_disabled')
  setHarnessAutoPromote(true)
})

test('promote auto: env off overrides store', () => {
  rollbackHarnessToDefault()
  setHarnessAutoPromote(true)
  process.env.OPPTRIX_HARNESS_AUTO_PROMOTE = '0'
  assert.equal(isHarnessAutoPromoteEnabled(), false)
  const out = runHarnessLab({ proposal: aProposal(), promote: 'auto' })
  assert.equal(out.promoted, null)
  assert.equal(out.skipReason, 'auto_promote_disabled')
  delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
  assert.equal(isHarnessAutoPromoteEnabled(), true)
})

test('promote manual: B allowed without auto gate', () => {
  rollbackHarnessToDefault()
  setHarnessAutoPromote(false)
  const out = runHarnessLab({ proposal: bProposal(), promote: 'manual' })
  // B replace may fail held-out if replace span not found in samples — still may promote if validation ok
  // assertProposalSafe passes; validate may still ok (baseline comparison)
  if (out.validation?.ok && !out.validation.safetyVeto) {
    assert.ok(out.promoted)
    const store = loadHarnessStore()
    assert.ok(store.auditLog.some(e => e.action === 'promote_manual'))
  } else {
    // 若 held-out 因 B 退步失败，至少不应走 auto
    assert.equal(out.promoted, null)
  }
  setHarnessAutoPromote(true)
  rollbackHarnessToDefault()
})

test('promote true === manual compatibility', () => {
  rollbackHarnessToDefault()
  const out = runHarnessLab({ proposal: aProposal(), promote: true })
  assert.ok(out.promoted)
  const store = loadHarnessStore()
  assert.ok(store.auditLog.some(e => e.action === 'promote_manual'))
  rollbackHarnessToDefault()
})

test.after(() => {
  try {
    getUserDataStore().close()
  } catch {
    /* ignore */
  }
  if (prevData == null) delete process.env.OPPTRIX_DATA_DIR
  else process.env.OPPTRIX_DATA_DIR = prevData
  if (prevEnv == null) delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
  else process.env.OPPTRIX_HARNESS_AUTO_PROMOTE = prevEnv
  fs.rmSync(tmp, { recursive: true, force: true })
})
