import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveBodyToolChoice,
} from '../packages/agent/dist/llm/provider.js'
import {
  shouldEnterVerifyPhase,
  resolveEffectiveResearchTier,
  resolveGatherToolChoice,
  resolveVerifyToolChoice,
  isBusinessToolName,
} from '../packages/agent/dist/loop/verify-phase.js'
import {
  resetResearchChecklistForTests,
  updateResearchChecklist,
} from '../packages/agent/dist/loop/research-checklist.js'

test('resolveBodyToolChoice defaults to auto when tools present', () => {
  assert.equal(resolveBodyToolChoice(2), 'auto')
  assert.equal(resolveBodyToolChoice(2, 'none'), 'none')
  assert.equal(resolveBodyToolChoice(2, 'required'), 'required')
  assert.deepEqual(
    resolveBodyToolChoice(1, { type: 'function', function: { name: 'ask_user' } }),
    { type: 'function', function: { name: 'ask_user' } },
  )
  assert.equal(resolveBodyToolChoice(0, 'none'), undefined)
})

test('resolveEffectiveResearchTier prefers expert default over route', () => {
  assert.equal(resolveEffectiveResearchTier('L3', 'L1'), 'L3')
  assert.equal(resolveEffectiveResearchTier(undefined, 'L1'), 'L1')
  assert.equal(resolveEffectiveResearchTier(null, 'L2'), 'L2')
  assert.equal(resolveEffectiveResearchTier('L2', undefined), 'L2')
})

test('verify phase gates: L1 without skill skips; L3 with tools enters', () => {
  assert.equal(shouldEnterVerifyPhase({
    researchTier: 'L1',
    hasActivatedSkill: false,
    businessToolsUsed: 2,
    alreadyVerified: false,
  }), false)

  assert.equal(shouldEnterVerifyPhase({
    researchTier: 'L3',
    hasActivatedSkill: false,
    businessToolsUsed: 1,
    alreadyVerified: false,
  }), true)

  assert.equal(shouldEnterVerifyPhase({
    researchTier: 'L1',
    hasActivatedSkill: true,
    businessToolsUsed: 1,
    alreadyVerified: false,
  }), true)

  assert.equal(shouldEnterVerifyPhase({
    researchTier: 'L3',
    hasActivatedSkill: false,
    businessToolsUsed: 0,
    alreadyVerified: false,
  }), false)

  assert.equal(shouldEnterVerifyPhase({
    researchTier: 'L3',
    hasActivatedSkill: false,
    businessToolsUsed: 3,
    alreadyVerified: true,
  }), false)
})

test('expert L3 + route L1 still enters verify via effective tier', () => {
  const effective = resolveEffectiveResearchTier('L3', 'L1')
  assert.equal(effective, 'L3')
  assert.equal(shouldEnterVerifyPhase({
    researchTier: effective,
    hasActivatedSkill: false,
    businessToolsUsed: 1,
    alreadyVerified: false,
  }), true)
  // 仅用路由 L1 会跳过 — 对照说明为何必须用 effective
  assert.equal(shouldEnterVerifyPhase({
    researchTier: 'L1',
    hasActivatedSkill: false,
    businessToolsUsed: 1,
    alreadyVerified: false,
  }), false)
})

test('resolveVerifyToolChoice is none; gather prefers none after checklist done once', () => {
  resetResearchChecklistForTests()
  assert.equal(resolveVerifyToolChoice(), 'none')
  assert.equal(resolveGatherToolChoice('g1'), 'auto')

  updateResearchChecklist('g1', {
    mode: 'replace',
    items: [{ id: '1', title: 'A', status: 'done' }],
  })
  assert.equal(resolveGatherToolChoice('g1', {
    preferNoneAfterChecklistDone: true,
    checklistNoneAlreadyTried: false,
  }), 'none')
  assert.equal(resolveGatherToolChoice('g1', {
    preferNoneAfterChecklistDone: true,
    checklistNoneAlreadyTried: true,
  }), 'auto')
})

test('isBusinessToolName excludes meta/interactive', () => {
  assert.equal(isBusinessToolName('get_instrument_realtime'), true)
  assert.equal(isBusinessToolName('ask_user'), false)
  assert.equal(isBusinessToolName('activate_tool_pack'), false)
  assert.equal(isBusinessToolName('update_research_checklist'), false)
})

test('isLastSafetyRound pairs with none tool choice on last step', async () => {
  const { isLastSafetyRound, LAST_STEP_TURN_TAIL } = await import(
    '../packages/agent/dist/loop/budget.js'
  )
  const { resolveBodyToolChoice } = await import(
    '../packages/agent/dist/llm/provider.js'
  )
  const max = 50
  const last = max - 1
  assert.equal(isLastSafetyRound(last, max), true)
  // 末轮：空 tools → body 不写 tool_choice；有 tools 时显式 none
  assert.equal(resolveBodyToolChoice(0, 'none'), undefined)
  assert.equal(resolveBodyToolChoice(2, 'none'), 'none')
  assert.ok(LAST_STEP_TURN_TAIL.includes('禁止再调用'))
})
