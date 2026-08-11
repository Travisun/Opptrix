/**
 * 整轮思考时间线：结构化 segments + 派生字符串 + live 竖轴数据
 */
import { describe, it, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  appendReasoningTimeline,
  appendReasoningSegment,
  beginReasoningSegment,
  formatReasoningSegmentLabel,
  joinReasoningSegments,
  resolveReasoningSegments,
  updateLastReasoningSegmentContent,
  REASONING_TIMELINE_SEP,
  SessionStore,
} from '../packages/agent/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'
import {
  applyChatProgressEvent,
  createEmptyStreamSnapshot,
} from '../client-ui/src/chat/sessionStreamRuntime.ts'
import {
  resolveReasoningSegments as resolveUiSegments,
} from '../client-ui/src/chat/reasoningTimeline.ts'

describe('reasoning segments helpers', () => {
  it('appendReasoningTimeline still joins with SEP', () => {
    assert.equal(appendReasoningTimeline('', '  round-1  '), 'round-1')
    assert.equal(appendReasoningTimeline('keep', '  '), 'keep')
    const mid = appendReasoningTimeline('tool-round', 'final-round')
    assert.equal(mid, `tool-round${REASONING_TIMELINE_SEP}final-round`)
  })

  it('append / join / label for structured segments', () => {
    let segs = []
    segs = appendReasoningSegment(segs, '先查工具', { at: '2026-08-11T04:00:00.000Z', round: 1 })
    segs = appendReasoningSegment(segs, '再给出结论', { at: '2026-08-11T04:01:00.000Z', round: 2 })
    assert.equal(segs.length, 2)
    assert.equal(segs[0].label, formatReasoningSegmentLabel(1))
    assert.equal(segs[1].label, '第 2 段思路')
    assert.equal(
      joinReasoningSegments(segs),
      `先查工具${REASONING_TIMELINE_SEP}再给出结论`,
    )
  })

  it('streaming updates last segment; prior segments retained', () => {
    let segs = appendReasoningSegment([], '段一', { round: 1 })
    segs = beginReasoningSegment(segs, { round: 2 })
    segs = updateLastReasoningSegmentContent(segs, '段')
    segs = updateLastReasoningSegmentContent(segs, '段二完整')
    assert.equal(segs.length, 2)
    assert.equal(segs[0].content, '段一')
    assert.equal(segs[1].content, '段二完整')
  })

  it('resolveReasoningSegments prefers structured; legacy string splits SEP', () => {
    const structured = resolveReasoningSegments(
      [{ content: 'A', label: '第 1 段思路' }, { content: 'B' }],
      'ignored',
    )
    assert.equal(structured.length, 2)
    assert.equal(structured[0].label, '第 1 段思路')

    const legacy = resolveReasoningSegments(
      undefined,
      `旧一段${REASONING_TIMELINE_SEP}旧二段`,
    )
    assert.equal(legacy.length, 2)
    assert.equal(legacy[0].content, '旧一段')
    assert.equal(legacy[0].label, undefined)
    assert.equal(legacy[1].content, '旧二段')

    const uiLegacy = resolveUiSegments(null, `x${REASONING_TIMELINE_SEP}y`)
    assert.deepEqual(uiLegacy.map(s => s.content), ['x', 'y'])
  })
})

describe('live thinkingSegments accumulate', () => {
  it('thinking event with segments updates liveTrace', () => {
    let snap = createEmptyStreamSnapshot()
    const segs = [
      { content: 'AAAA'.repeat(50), label: '第 1 段思路', round: 1 },
    ]
    snap = applyChatProgressEvent(snap, {
      type: 'thinking',
      round: 1,
      label: '模型正在思考…',
      snippet: segs[0].content,
      segments: segs,
    })
    assert.equal(snap.liveTrace?.thinkingSegments?.length, 1)
    assert.equal(snap.liveTrace?.thinkingSnippet?.length, 200)

    const longer = [
      segs[0],
      { content: 'BBBB'.repeat(80), label: '第 2 段思路', round: 2 },
    ]
    snap = applyChatProgressEvent(snap, {
      type: 'thinking',
      round: 2,
      label: '模型正在思考…',
      snippet: joinReasoningSegments(longer),
      segments: longer,
    })
    assert.equal(snap.liveTrace?.thinkingSegments?.length, 2)
    assert.equal(snap.liveTrace?.thinkingSegments?.[0]?.content, segs[0].content)
    assert.ok((snap.liveTrace?.thinkingSnippet?.length ?? 0) > 400)
  })

  it('legacy snippet-only event still segments via SEP', () => {
    let snap = createEmptyStreamSnapshot()
    const snippet = `工具轮${REASONING_TIMELINE_SEP}终轮`
    snap = applyChatProgressEvent(snap, {
      type: 'thinking',
      round: 2,
      label: '模型正在思考…',
      snippet,
    })
    assert.equal(snap.liveTrace?.thinkingSegments?.length, 2)
    assert.equal(snap.liveTrace?.thinkingSnippet, snippet)
  })

  it('tool_start does not clear thinkingSegments', () => {
    let snap = createEmptyStreamSnapshot()
    snap = applyChatProgressEvent(snap, {
      type: 'thinking',
      round: 1,
      label: '模型正在思考…',
      snippet: '工具轮推理中…',
      segments: [{ content: '工具轮推理中…', label: '第 1 段思路', round: 1 }],
    })
    snap = applyChatProgressEvent(snap, {
      type: 'tool_start',
      step: {
        id: 'c1',
        tool: 'search',
        label: '搜索',
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    })
    assert.equal(snap.liveTrace?.thinkingSnippet, '工具轮推理中…')
    assert.equal(snap.liveTrace?.thinkingSegments?.[0]?.content, '工具轮推理中…')
    assert.equal(snap.liveTrace?.steps?.length, 1)
  })
})

/**
 * 模拟 engine onDelta 契约：hasToolCalls 只停 token progress，不挡同包 reasoning。
 */
describe('onDelta hasToolCalls preserves co-packaged reasoning', () => {
  it('accumulates reasoning when hasToolCalls is set on same delta', () => {
    let reasoningAccumulated = ''
    let stopTokenProgress = false
    let streamingOpen = false
    let segments = []
    /** @type {string[]} */
    const snippets = []

    const onDelta = (delta) => {
      if (delta.hasToolCalls) {
        stopTokenProgress = true
      }
      if (delta.reasoningText) {
        reasoningAccumulated += delta.reasoningText
        if (!streamingOpen) {
          segments = beginReasoningSegment(segments, { round: 1 })
          streamingOpen = true
        }
        segments = updateLastReasoningSegmentContent(segments, reasoningAccumulated)
        snippets.push(joinReasoningSegments(segments))
      }
      if (stopTokenProgress || !delta.text) return
    }

    onDelta({ hasToolCalls: true, reasoningText: '先查行情' })
    onDelta({ reasoningText: '再决定工具' })
    if (reasoningAccumulated) {
      segments = updateLastReasoningSegmentContent(segments, reasoningAccumulated)
      snippets.push(joinReasoningSegments(segments))
    }

    assert.equal(stopTokenProgress, true)
    assert.equal(reasoningAccumulated, '先查行情再决定工具')
    assert.equal(snippets[0], '先查行情')
    assert.equal(snippets.at(-1), '先查行情再决定工具')
    assert.equal(segments.length, 1)
  })
})

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-turn-timeline-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  getUserDataStore().close()
  return fn().finally(() => {
    getUserDataStore().close()
    fs.rmSync(tmp, { recursive: true, force: true })
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
  })
}

test('display turn persists segments and derived reasoningContent', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '整轮时间线' })
    const now = new Date().toISOString()
    const segments = appendReasoningSegment(
      appendReasoningSegment([], '先查工具', { at: now, round: 1 }),
      '再给出结论',
      { at: now, round: 2 },
    )
    const timeline = joinReasoningSegments(segments)
    record.turns = [
      { role: 'user', content: '问', at: now },
      {
        role: 'assistant',
        content: '答',
        at: now,
        reasoningContent: timeline,
        reasoningSegments: segments,
        toolSteps: [
          {
            id: 'c1',
            tool: 'search',
            label: '搜索',
            status: 'done',
            startedAt: now,
          },
        ],
      },
    ]
    record.messages = [
      { role: 'user', content: '问' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{}' } }],
        reasoningContent: '先查工具',
      },
      { role: 'tool', tool_call_id: 'c1', name: 'search', content: '{}' },
      { role: 'assistant', content: '答', reasoningContent: '再给出结论' },
    ]
    store.save(record)

    const loaded = store.get(record.id)
    assert.ok(loaded)
    assert.equal(loaded.turns[1].reasoningContent, timeline)
    assert.equal(loaded.turns[1].reasoningSegments?.length, 2)
    const finalMsg = loaded.messages.filter(m => m.role === 'assistant' && !m.tool_calls).at(-1)
    assert.equal(finalMsg?.reasoningContent, '再给出结论')
    const display = store.toDisplayMessages(loaded)
    assert.equal(display[1].reasoningContent, timeline)
    assert.equal(display[1].reasoningSegments?.length, 2)
    assert.equal(display[1].reasoningSegments?.[0]?.label, '第 1 段思路')
    assert.equal(display[1].toolSteps?.[0]?.thinking, undefined)
  })
})

test('legacy string-only turn still resolves to segments in UI helper', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '旧字符串' })
    const now = new Date().toISOString()
    const timeline = `仅字符串一段${REASONING_TIMELINE_SEP}仅字符串二段`
    record.turns = [
      { role: 'user', content: '问', at: now },
      { role: 'assistant', content: '答', at: now, reasoningContent: timeline },
    ]
    record.messages = [
      { role: 'user', content: '问' },
      { role: 'assistant', content: '答', reasoningContent: '仅字符串二段' },
    ]
    store.save(record)
    const display = store.toDisplayMessages(store.get(record.id))
    assert.equal(display[1].reasoningSegments, undefined)
    const resolved = resolveReasoningSegments(display[1].reasoningSegments, display[1].reasoningContent)
    assert.equal(resolved.length, 2)
    assert.equal(resolved[0].label, undefined)
  })
})
