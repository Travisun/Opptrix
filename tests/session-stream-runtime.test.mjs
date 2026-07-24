import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyChatProgressEvent,
  createEmptyStreamSnapshot,
} from '../client-ui/src/chat/sessionStreamRuntime.ts'

const pendingPrompt = {
  id: 'p1',
  prompt: '确认执行？',
  options: [{ id: 'yes', label: '确认' }],
}

function snapshotWithPending() {
  return {
    ...createEmptyStreamSnapshot(),
    pendingUserPrompt: pendingPrompt,
  }
}

describe('applyChatProgressEvent pendingUserPrompt', () => {
  it('clears pending on tool_done for shell_run', () => {
    const next = applyChatProgressEvent(snapshotWithPending(), {
      type: 'tool_done',
      step: {
        id: 'step-1',
        tool: 'shell_run',
        label: '运行命令',
        status: 'done',
        startedAt: new Date().toISOString(),
      },
    })
    assert.equal(next.pendingUserPrompt, null)
  })

  it('clears pending on tool_done for ask_user', () => {
    const next = applyChatProgressEvent(snapshotWithPending(), {
      type: 'tool_done',
      step: {
        id: 'step-2',
        tool: 'ask_user',
        label: '向你提问',
        status: 'done',
        startedAt: new Date().toISOString(),
      },
    })
    assert.equal(next.pendingUserPrompt, null)
  })

  it('clears pending on done', () => {
    const next = applyChatProgressEvent(snapshotWithPending(), {
      type: 'done',
      reply: '完成',
      tools_used: [],
      session_id: 's1',
      tool_steps: [],
    })
    assert.equal(next.pendingUserPrompt, null)
  })

  it('clears pending on error', () => {
    const next = applyChatProgressEvent(snapshotWithPending(), {
      type: 'error',
      message: '出错了',
    })
    assert.equal(next.pendingUserPrompt, null)
  })

  it('sets pending on user_prompt', () => {
    const next = applyChatProgressEvent(createEmptyStreamSnapshot(), {
      type: 'user_prompt',
      prompt: pendingPrompt,
    })
    assert.deepEqual(next.pendingUserPrompt, pendingPrompt)
  })
})
