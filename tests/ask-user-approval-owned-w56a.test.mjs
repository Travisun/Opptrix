import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  UserPromptBridge,
  allocateApprovalOwnedPromptId,
  userPromptAnswerFromApprovalDecision,
  deriveApprovedFromUserPromptAnswer,
} from '../packages/agent/dist/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('ask_user approval-owned primary path (Wave 56A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('C-ASK-USER-APPROVAL-OWNED: allocate → pending≥1 → approval.resolve completes waiter', async () => {
    const ctx = platform.createPlatformContext()
    const bridge = new UserPromptBridge()
    const sessionId = 'sess-w56a-ask'

    ctx.approval.bindUserPromptResolve(({ id, sessionId: sid, decision }) => {
      bridge.submit(sid, id, userPromptAnswerFromApprovalDecision(decision))
    })

    /** @type {import('../packages/agent/dist/approval-tracker.js').ApprovalTracker} */
    const tracker = {
      track(input) {
        ctx.approval.request({
          id: input.id,
          sessionId: input.sessionId,
          kind: input.kind,
          title: input.title,
          meta: { promptId: input.id },
        })
      },
      resolve(id, decision) {
        ctx.approval.resolve(id, decision)
      },
      cancelSession(sessionId) {
        ctx.approval.cancelSession(sessionId)
      },
    }

    // Simulate engine ask_user: approval first, then bridge wait (promptId === approval.id)
    const promptId = allocateApprovalOwnedPromptId(tracker, {
      sessionId,
      kind: 'ask_user',
      title: 'Choose direction',
    })

    const pending = ctx.approval.list(sessionId)
    assert.equal(pending.length, 1)
    assert.equal(pending[0]?.id, promptId)
    assert.equal(pending[0]?.kind, 'ask_user')
    assert.equal(pending[0]?.meta?.promptId, promptId)
    assert.ok(ctx.info().approvalsPending >= 1)

    const answerPromise = bridge.waitForAnswer(sessionId, promptId)

    const result = platform.admitResolveApproval(ctx, promptId, {
      approved: true,
      note: 'go ahead',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected admit ok')
    assert.equal(result.resolved, true)
    assert.equal(result.approvalsPending, 0)
    assert.equal(ctx.info().approvalsPending, 0)

    const answer = await answerPromise
    assert.equal(answer.kind, 'custom')
    assert.equal(answer.custom_text, 'go ahead')
    assert.equal(deriveApprovedFromUserPromptAnswer(answer), true)
  })

  it('allocate without tracker still returns id; no pending approval', () => {
    const id = allocateApprovalOwnedPromptId(undefined, {
      sessionId: 'sess-orphan',
      kind: 'ask_user',
    })
    assert.equal(typeof id, 'string')
    assert.ok(id.length > 0)
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().approvalsPending, 0)
  })

  it('default kind is ask_user; custom id preserved', () => {
    const ctx = platform.createPlatformContext()
    /** @type {import('../packages/agent/dist/approval-tracker.js').ApprovalTracker} */
    const tracker = {
      track(input) {
        ctx.approval.request({
          id: input.id,
          sessionId: input.sessionId,
          kind: input.kind,
          title: input.title,
          meta: { promptId: input.id },
        })
      },
      resolve() {},
      cancelSession() {},
    }
    const fixed = 'w56-fixed-prompt'
    const id = allocateApprovalOwnedPromptId(tracker, {
      sessionId: 'sess-fixed',
      id: fixed,
      title: 'Pick',
    })
    assert.equal(id, fixed)
    const row = ctx.approval.list('sess-fixed')[0]
    assert.equal(row?.id, fixed)
    assert.equal(row?.kind, 'ask_user')
    assert.equal(row?.meta?.promptId, fixed)
  })

  it('ABI 0.8.43-w58', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
