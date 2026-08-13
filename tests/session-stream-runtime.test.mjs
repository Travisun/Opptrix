import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyChatProgressEvent,
  createEmptyStreamSnapshot,
  formatLiveThinkingStatus,
  stripPhaseEllipsis,
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

describe('formatLiveThinkingStatus', () => {
  it('strips trailing ellipsis for phaseLabel', () => {
    assert.equal(stripPhaseEllipsis('模型正在思考…'), '模型正在思考')
    assert.equal(stripPhaseEllipsis('模型正在整理结果...'), '模型正在整理结果')
  })

  it('omits token and step segments when absent', () => {
    assert.equal(formatLiveThinkingStatus('模型正在思考', undefined, 0), '模型正在思考…')
  })

  it('includes token estimate when present', () => {
    assert.equal(
      formatLiveThinkingStatus('模型正在思考', 128, 0),
      '模型正在思考 · 约 128 tokens…',
    )
  })

  it('includes step count only when > 0', () => {
    assert.equal(
      formatLiveThinkingStatus('模型正在整理结果', 1200, 8),
      '模型正在整理结果 · 约 1.2k tokens · 第 8 步…',
    )
    assert.equal(
      formatLiveThinkingStatus('模型正在整理结果', undefined, 3),
      '模型正在整理结果 · 第 3 步…',
    )
  })
})

describe('applyChatProgressEvent pendingUserPrompt', () => {
  it('clears pending on tool_done for opptrix_run', () => {
    const next = applyChatProgressEvent(snapshotWithPending(), {
      type: 'tool_done',
      step: {
        id: 'step-1',
        tool: 'opptrix_run',
        label: 'Opptrix 运行',
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

  it('sets contextHint on context_compact', () => {
    const next = applyChatProgressEvent(createEmptyStreamSnapshot(), {
      type: 'context_compact',
      level: 'structured',
      message: '已整理较早对话要点，后续仍按你的目标继续。',
    })
    assert.match(next.contextHint ?? '', /整理/)
    assert.match(next.liveTrace?.thinkingLabel ?? '', /整理/)
  })

  it('shows estimated token progress on reply without content', () => {
    const next = applyChatProgressEvent(createEmptyStreamSnapshot(), {
      type: 'reply',
      estimatedTokens: 128,
    })
    assert.equal(next.liveTrace?.phaseLabel, '模型正在思考')
    assert.equal(next.liveTrace?.estimatedTokens, 128)
    assert.equal(next.liveTrace?.thinkingLabel, '模型正在思考 · 约 128 tokens…')
  })

  it('prefers estimatedTokens label even when content is present', () => {
    const next = applyChatProgressEvent(createEmptyStreamSnapshot(), {
      type: 'reply',
      content: '最终正文',
      estimatedTokens: 1500,
    })
    assert.equal(next.liveTrace?.thinkingLabel, '模型正在思考 · 约 1.5k tokens…')
  })

  it('falls back to thinking label when reply has no estimatedTokens', () => {
    const next = applyChatProgressEvent(createEmptyStreamSnapshot(), {
      type: 'reply',
      content: '正文',
    })
    assert.equal(next.liveTrace?.estimatedTokens, undefined)
    assert.equal(next.liveTrace?.thinkingLabel, '模型正在思考…')
  })

  it('keeps consolidating label after tools when reply streams tokens', () => {
    const withTools = {
      ...createEmptyStreamSnapshot(),
      liveTrace: {
        steps: [],
        phaseLabel: '模型正在整理结果',
        thinkingLabel: '模型正在整理结果…',
      },
    }
    const withTokens = applyChatProgressEvent(withTools, {
      type: 'reply',
      estimatedTokens: 64,
    })
    assert.equal(withTokens.liveTrace?.thinkingLabel, '模型正在整理结果 · 约 64 tokens…')

    const withoutTokens = applyChatProgressEvent(withTools, {
      type: 'reply',
    })
    assert.equal(withoutTokens.liveTrace?.thinkingLabel, '模型正在整理结果…')
  })

  it('clears prior estimatedTokens on new thinking round', () => {
    const prior = {
      ...createEmptyStreamSnapshot(),
      liveTrace: {
        steps: [],
        phaseLabel: '模型正在思考',
        estimatedTokens: 999,
        thinkingLabel: '模型正在思考 · 约 999 tokens…',
      },
    }
    const next = applyChatProgressEvent(prior, {
      type: 'thinking',
      round: 2,
      label: '模型正在思考…',
    })
    assert.equal(next.liveTrace?.estimatedTokens, undefined)
    assert.equal(next.liveTrace?.thinkingLabel, '模型正在思考…')
  })

  it('stores full thinking snippet rather than truncating to last 400', () => {
    const full = 'X'.repeat(900)
    const next = applyChatProgressEvent(createEmptyStreamSnapshot(), {
      type: 'thinking',
      round: 1,
      label: '模型正在思考…',
      snippet: full,
    })
    assert.equal(next.liveTrace?.thinkingSnippet, full)
    assert.equal(next.liveTrace?.thinkingSnippet?.length, 900)
  })

  it('shows total step count with tokens after tool_done and reply', () => {
    let snap = createEmptyStreamSnapshot()
    snap = applyChatProgressEvent(snap, {
      type: 'thinking',
      round: 1,
      label: '模型正在思考…',
    })
    snap = applyChatProgressEvent(snap, {
      type: 'tool_start',
      step: {
        id: 's1',
        tool: 'search',
        label: '搜索',
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    })
    snap = applyChatProgressEvent(snap, {
      type: 'tool_done',
      step: {
        id: 's1',
        tool: 'search',
        label: '搜索',
        status: 'done',
        startedAt: new Date().toISOString(),
      },
    })
    assert.equal(snap.liveTrace?.phaseLabel, '模型正在整理结果')
    assert.match(snap.liveTrace?.thinkingLabel ?? '', /第 1 步/)

    snap = applyChatProgressEvent(snap, {
      type: 'reply',
      estimatedTokens: 1200,
    })
    assert.equal(
      snap.liveTrace?.thinkingLabel,
      '模型正在整理结果 · 约 1.2k tokens · 第 1 步…',
    )
  })

  it('preserves tokens across tool_start while updating step count', () => {
    let snap = {
      ...createEmptyStreamSnapshot(),
      liveTrace: {
        steps: [],
        phaseLabel: '模型正在思考',
        estimatedTokens: 50,
        thinkingLabel: '模型正在思考 · 约 50 tokens…',
      },
    }
    snap = applyChatProgressEvent(snap, {
      type: 'tool_start',
      step: {
        id: 's1',
        tool: 'search',
        label: '搜索',
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    })
    assert.equal(snap.liveTrace?.estimatedTokens, 50)
    assert.equal(snap.liveTrace?.thinkingLabel, '模型正在思考 · 约 50 tokens · 第 1 步…')
  })
})
