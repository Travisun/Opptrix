import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  deriveApprovedFromUserPromptAnswer,
} from '../packages/agent/dist/approval-tracker.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('approval custom id + tracker mirror (Wave 7A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('accepts trimmed custom id and rejects duplicates', () => {
    const q = platform.createApprovalQueue()
    const fixed = 'prompt-fixed-id-1'
    const ok = q.request({
      sessionId: 'sess-a',
      kind: 'ask_user',
      id: `  ${fixed}  `,
      title: 'Choose',
    })
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected ok')
    assert.equal(ok.id, fixed)

    const pending = q.list('sess-a')
    assert.equal(pending.length, 1)
    assert.equal(pending[0]?.id, fixed)

    const dup = q.request({
      sessionId: 'sess-a',
      kind: 'ask_user',
      id: fixed,
    })
    assert.equal(dup.ok, false)
    if (dup.ok) throw new Error('expected duplicate fail')
    assert.equal(dup.error, 'duplicate approval id')
    assert.equal(q.list().length, 1)
  })

  it('tracker adapter: track → list pending → resolve → empty', () => {
    const q = platform.createApprovalQueue()
    /** @type {import('../packages/agent/dist/approval-tracker.js').ApprovalTracker} */
    const tracker = {
      track(input) {
        q.request({
          id: input.id,
          sessionId: input.sessionId,
          kind: input.kind,
          title: input.title,
          meta: { promptId: input.id },
        })
      },
      resolve(id, decision) {
        q.resolve(id, decision)
      },
      cancelSession(sessionId) {
        q.cancelSession(sessionId)
      },
    }

    const id = 'mirror-prompt-9'
    tracker.track({
      id,
      sessionId: 'sess-m',
      kind: 'ask_user',
      title: 'Pick one',
    })
    assert.equal(q.list('sess-m').length, 1)
    assert.equal(q.list('sess-m')[0]?.id, id)
    assert.equal(q.list('sess-m')[0]?.meta?.promptId, id)

    tracker.resolve(id, { approved: true, note: 'yes' })
    assert.deepEqual(q.list('sess-m'), [])
  })

  it('tracker cancelSession clears pending for session', () => {
    const q = platform.createApprovalQueue()
    const tracker = {
      track(input) {
        q.request({
          id: input.id,
          sessionId: input.sessionId,
          kind: input.kind,
          title: input.title,
          meta: { promptId: input.id },
        })
      },
      resolve(id, decision) {
        q.resolve(id, decision)
      },
      cancelSession(sessionId) {
        q.cancelSession(sessionId)
      },
    }
    tracker.track({ id: 'c1', sessionId: 's1', kind: 'workspace_confirm' })
    tracker.track({ id: 'c2', sessionId: 's1', kind: 'ask_user_choice' })
    tracker.track({ id: 'c3', sessionId: 's2', kind: 'request_secret' })
    assert.equal(q.list('s1').length, 2)
    tracker.cancelSession('s1')
    assert.equal(q.list('s1').length, 0)
    assert.equal(q.list('s2').length, 1)
  })

  it('deriveApprovedFromUserPromptAnswer best-effort rules', () => {
    assert.equal(deriveApprovedFromUserPromptAnswer({ selected_ids: ['ok'] }), true)
    assert.equal(deriveApprovedFromUserPromptAnswer({ cancelled: true, selected_ids: [] }), false)
    assert.equal(deriveApprovedFromUserPromptAnswer({ selected_ids: ['reject'] }), false)
    assert.equal(deriveApprovedFromUserPromptAnswer({ selected_ids: ['cancel'] }), false)
    assert.equal(deriveApprovedFromUserPromptAnswer({ selected_ids: ['a', 'cancel'] }), false)
  })
})
