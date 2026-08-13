/**
 * Session persist soft-cap — extreme sessions only; keep recent UI turns.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SessionStore,
  applySessionPersistSoftCap,
  SESSION_PERSIST_KEEP_RECENT_TURNS,
  SESSION_PERSIST_TURNS_TRIGGER,
} from '../packages/agent/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-session-soft-cap-'))
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

test('applySessionPersistSoftCap no-ops under thresholds', () => {
  const now = new Date().toISOString()
  const record = {
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
    turns: [
      { role: 'user', content: 'hi', at: now },
      { role: 'assistant', content: 'hello', at: now },
    ],
    sessionMemory: { goal: 'keep-me', updatedAt: now },
  }
  const result = applySessionPersistSoftCap(record)
  assert.equal(result.applied, false)
  assert.equal(record.turns.length, 2)
  assert.equal(record.sessionMemory.goal, 'keep-me')
})

test('applySessionPersistSoftCap keeps recent turns and sessionMemory when over turn trigger', () => {
  const now = new Date().toISOString()
  const turns = []
  const messages = []
  const n = SESSION_PERSIST_TURNS_TRIGGER + 50
  for (let i = 0; i < n; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    const content = `turn-${i}`
    turns.push({ role, content, at: now })
    messages.push({ role, content })
  }
  // Old tool blob before recent window
  messages.splice(1, 0, {
    role: 'tool',
    tool_call_id: 'c0',
    name: 'big',
    content: 'X'.repeat(4000),
  })
  const record = {
    messages,
    turns,
    sessionMemory: {
      goal: 'long-chat',
      constraints: '',
      entities: '',
      facts: '',
      decisions: '',
      openQuestions: '',
      rejected: '',
      workingState: '',
      updatedAt: now,
      sourceMessageCount: n,
      compactVersion: 1,
    },
  }
  const result = applySessionPersistSoftCap(record)
  assert.equal(result.applied, true)
  assert.ok(result.trimmedTurns > 0)
  assert.equal(record.turns.length, SESSION_PERSIST_KEEP_RECENT_TURNS)
  assert.equal(record.turns[record.turns.length - 1].content, `turn-${n - 1}`)
  assert.equal(record.sessionMemory.goal, 'long-chat')
  const tool = record.messages.find(m => m.role === 'tool')
  // Old tool may have been dropped with trimmed prefix; if present must be stubbed.
  if (tool) {
    assert.ok(String(tool.content).length < 4000)
  }
})

test('applySessionPersistSoftCap stubs huge tool payloads when over byte trigger', () => {
  const now = new Date().toISOString()
  const huge = 'Z'.repeat(3 * 1024 * 1024)
  const record = {
    messages: [
      { role: 'user', content: 'ask' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'big', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'c1', name: 'big', content: huge },
      { role: 'assistant', content: 'done' },
    ],
    turns: [
      { role: 'user', content: 'ask', at: now },
      {
        role: 'assistant',
        content: 'done',
        at: now,
        toolSteps: [{
          id: 's1',
          tool: 'big',
          label: 'big',
          status: 'done',
          startedAt: now,
          resultDetail: huge.slice(0, 8000),
        }],
      },
    ],
  }
  // Force byte path: few turns but oversized payload (bypass cheap gate via message count + size).
  // Pad messages so likelyLarge gate opens, then estimate exceeds 8MB.
  for (let i = 0; i < 90; i++) {
    record.messages.push({
      role: 'tool',
      tool_call_id: `pad-${i}`,
      name: 'pad',
      content: 'Y'.repeat(100_000),
    })
  }
  const result = applySessionPersistSoftCap(record)
  assert.equal(result.applied, true)
  assert.ok(result.shrunkToolFields > 0)
  assert.equal(record.turns.length, 2)
  assert.equal(record.turns[1].content, 'done')
  const tool0 = record.messages.find(m => m.tool_call_id === 'c1')
  assert.ok(tool0)
  assert.ok(String(tool0.content).length < huge.length)
  assert.match(String(tool0.content), /soft-cap|trimmed/)
})

test('SessionStore.save soft-caps extreme turns and reloads recent history', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '软顶会话' })
    const now = new Date().toISOString()
    const n = SESSION_PERSIST_TURNS_TRIGGER + 20
    record.turns = []
    record.messages = []
    for (let i = 0; i < n; i++) {
      const role = i % 2 === 0 ? 'user' : 'assistant'
      const content = `msg-${i}`
      record.turns.push({ role, content, at: now })
      record.messages.push({ role, content })
    }
    record.sessionMemory = {
      goal: 'persisted-summary',
      constraints: '',
      entities: '',
      facts: '',
      decisions: '',
      openQuestions: '',
      rejected: '',
      workingState: '',
      updatedAt: now,
      sourceMessageCount: n,
      compactVersion: 1,
    }
    store.save(record)

    const loaded = store.get(record.id)
    assert.ok(loaded)
    assert.equal(loaded.turns.length, SESSION_PERSIST_KEEP_RECENT_TURNS)
    assert.equal(loaded.turns[loaded.turns.length - 1].content, `msg-${n - 1}`)
    assert.equal(loaded.sessionMemory?.goal, 'persisted-summary')
  })
})
