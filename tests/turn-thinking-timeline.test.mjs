/**
 * 整轮思考时间线：多轮 reasoning 拼接；live 快照累积全文
 */
import { describe, it, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  appendReasoningTimeline,
  REASONING_TIMELINE_SEP,
  SessionStore,
} from '../packages/agent/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'
import {
  applyChatProgressEvent,
  createEmptyStreamSnapshot,
} from '../client-ui/src/chat/sessionStreamRuntime.ts'

describe('appendReasoningTimeline', () => {
  it('returns first chunk when existing empty', () => {
    assert.equal(appendReasoningTimeline('', '  round-1  '), 'round-1')
  })

  it('ignores empty chunk', () => {
    assert.equal(appendReasoningTimeline('keep', '  '), 'keep')
  })

  it('joins multi-round reasoning in order with separator', () => {
    const mid = appendReasoningTimeline('tool-round', 'final-round')
    assert.equal(mid, `tool-round${REASONING_TIMELINE_SEP}final-round`)
    const full = appendReasoningTimeline(
      appendReasoningTimeline('r1', 'r2'),
      'r3',
    )
    assert.equal(full, `r1${REASONING_TIMELINE_SEP}r2${REASONING_TIMELINE_SEP}r3`)
  })
})

describe('live thinkingSnippet accumulates full text', () => {
  it('replaces with longer full snippet across thinking events', () => {
    let snap = createEmptyStreamSnapshot()
    snap = applyChatProgressEvent(snap, {
      type: 'thinking',
      round: 1,
      label: '模型正在思考…',
      snippet: 'AAAA'.repeat(50),
    })
    assert.equal(snap.liveTrace?.thinkingSnippet?.length, 200)

    const longer = `${'AAAA'.repeat(50)}\n\n---\n\n${'BBBB'.repeat(80)}`
    snap = applyChatProgressEvent(snap, {
      type: 'thinking',
      round: 2,
      label: '模型正在思考…',
      snippet: longer,
    })
    assert.equal(snap.liveTrace?.thinkingSnippet, longer)
    assert.ok((snap.liveTrace?.thinkingSnippet?.length ?? 0) > 400)
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

test('display turn keeps multi-round timeline in reasoningContent', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '整轮时间线' })
    const now = new Date().toISOString()
    const timeline = appendReasoningTimeline('先查工具', '再给出结论')
    record.turns = [
      { role: 'user', content: '问', at: now },
      {
        role: 'assistant',
        content: '答',
        at: now,
        reasoningContent: timeline,
        toolSteps: [
          {
            id: 'c1',
            tool: 'search',
            label: '搜索',
            status: 'done',
            startedAt: now,
            // 无长 reasoning 副本
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
      // messages 终轮仅本轮 reasoning（wire）；turns 存整轮时间线
      { role: 'assistant', content: '答', reasoningContent: '再给出结论' },
    ]
    store.save(record)

    const loaded = store.get(record.id)
    assert.ok(loaded)
    assert.equal(loaded.turns[1].reasoningContent, timeline)
    const finalMsg = loaded.messages.filter(m => m.role === 'assistant' && !m.tool_calls).at(-1)
    assert.equal(finalMsg?.reasoningContent, '再给出结论')
    const display = store.toDisplayMessages(loaded)
    assert.equal(display[1].reasoningContent, timeline)
    assert.match(display[1].reasoningContent ?? '', /先查工具/)
    assert.match(display[1].reasoningContent ?? '', /再给出结论/)
    assert.equal(display[1].toolSteps?.[0]?.thinking, undefined)
  })
})
