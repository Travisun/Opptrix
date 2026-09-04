import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  UserPromptBridge,
  userPromptAnswerFromApprovalDecision,
  deriveApprovedFromUserPromptAnswer,
} from '../packages/agent/dist/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('approval → UserPrompt soft resolve (Wave 50A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('C-APPROVAL-PROMPT-RESOLVE: queue.resolve → matching pending prompt settles', async () => {
    const ctx = platform.createPlatformContext()
    const bridge = new UserPromptBridge()
    const promptId = 'w50-prompt-1'
    const sessionId = 'sess-w50a'

    ctx.approval.bindUserPromptResolve(({ id, sessionId: sid, decision }) => {
      bridge.submit(sid, id, userPromptAnswerFromApprovalDecision(decision))
    })

    const created = ctx.approval.request({
      sessionId,
      kind: 'ask_user',
      id: promptId,
      title: 'Soft reverse mirror',
      meta: { promptId },
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')
    assert.equal(created.id, promptId)

    const answerPromise = bridge.waitForAnswer(sessionId, promptId)
    assert.equal(ctx.info().approvalsPending, 1)

    const ok = ctx.approval.resolve(promptId, {
      approved: true,
      note: ' ship it ',
    })
    assert.equal(ok, true)
    assert.equal(ctx.info().approvalsPending, 0)

    const answer = await answerPromise
    assert.equal(answer.kind, 'custom')
    assert.equal(answer.custom_text, 'ship it')
    assert.equal(deriveApprovedFromUserPromptAnswer(answer), true)
  })

  it('admitResolveApproval also soft-resolves bound UserPrompt', async () => {
    const ctx = platform.createPlatformContext()
    const bridge = new UserPromptBridge()
    const promptId = 'w50-admit-2'
    const sessionId = 'sess-w50-admit'

    ctx.approval.bindUserPromptResolve(({ id, sessionId: sid, decision }) => {
      bridge.submit(sid, id, userPromptAnswerFromApprovalDecision(decision))
    })

    const created = ctx.approval.request({
      sessionId,
      kind: 'ask_user',
      id: promptId,
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    const answerPromise = bridge.waitForAnswer(sessionId, promptId)
    const result = platform.admitResolveApproval(ctx, promptId, {
      approved: false,
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected admit ok')
    assert.equal(result.resolved, true)
    assert.equal(result.approvalsPending, 0)

    const answer = await answerPromise
    assert.equal(answer.kind, 'option')
    assert.deepEqual(answer.selected_ids, ['reject'])
    assert.equal(deriveApprovedFromUserPromptAnswer(answer), false)
  })

  it('fail-open: resolve succeeds when prompt missing; handler throw ignored', () => {
    const ctx = platform.createPlatformContext()
    const created = ctx.approval.request({
      sessionId: 'sess-w50-miss',
      kind: 'tool.exec',
      id: 'orphan-approval',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    // No bind → resolve still clears queue
    assert.equal(
      ctx.approval.resolve('orphan-approval', { approved: true }),
      true,
    )
    assert.equal(ctx.info().approvalsPending, 0)

    const created2 = ctx.approval.request({
      sessionId: 'sess-w50-throw',
      kind: 'ask_user',
      id: 'throw-handler',
    })
    assert.equal(created2.ok, true)
    if (!created2.ok) throw new Error('expected request ok')

    ctx.approval.bindUserPromptResolve(() => {
      throw new Error('prompt bridge down')
    })
    assert.equal(
      ctx.approval.resolve('throw-handler', { approved: false }),
      true,
    )
    assert.equal(ctx.info().approvalsPending, 0)
  })

  it('userPromptAnswerFromApprovalDecision + ABI 0.8.43-w58', () => {
    const approved = userPromptAnswerFromApprovalDecision({ approved: true })
    assert.deepEqual(approved.selected_ids, ['approve'])
    assert.equal(deriveApprovedFromUserPromptAnswer(approved), true)

    const rejected = userPromptAnswerFromApprovalDecision({
      approved: false,
      note: 'nope',
    })
    assert.equal(rejected.kind, 'custom')
    assert.equal(rejected.custom_text, 'nope')
    assert.equal(deriveApprovedFromUserPromptAnswer(rejected), false)

    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
