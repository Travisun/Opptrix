/**
 * SessionStore.truncateFromDisplayIndex — user 锚点截断 turns/messages
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SessionStore } from '../packages/agent/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-session-truncate-'))
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

test('truncateFromDisplayIndex keeps prior turns/messages and clears from mid user', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '截断测试' })
    const now = new Date().toISOString()

    record.turns = [
      { role: 'user', content: '第一条', at: now },
      { role: 'assistant', content: '回复一', at: now },
      { role: 'user', content: '第二条要编辑', at: now },
      { role: 'assistant', content: '回复二', at: now },
    ]
    record.messages = [
      { role: 'user', content: '第一条' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', name: 'search', content: '{}' },
      { role: 'assistant', content: '回复一' },
      { role: 'user', content: '第二条要编辑' },
      { role: 'assistant', content: '回复二' },
    ]
    record.sessionMemory = {
      goal: '旧目标',
      constraints: '',
      entities: '',
      facts: '',
      decisions: '',
      openQuestions: '',
      rejected: '',
      workingState: '',
      updatedAt: now,
      sourceMessageCount: 6,
      compactVersion: 1,
    }
    store.save(record)

    const updated = store.truncateFromDisplayIndex(record.id, 2)
    assert.ok(updated)
    assert.equal(updated.turns.length, 2)
    assert.equal(updated.turns[0].role, 'user')
    assert.equal(updated.turns[0].content, '第一条')
    assert.equal(updated.turns[1].role, 'assistant')
    assert.equal(updated.turns[1].content, '回复一')
    assert.equal(updated.messages.length, 4)
    assert.equal(updated.messages[0].role, 'user')
    assert.equal(updated.messages[3].role, 'assistant')
    assert.equal(updated.messages[3].content, '回复一')
    assert.equal(updated.sessionMemory, null)
  })
})

test('truncateFromDisplayIndex rejects assistant anchor and out of range', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '截断拒绝' })
    const now = new Date().toISOString()
    record.turns = [
      { role: 'user', content: '问', at: now },
      { role: 'assistant', content: '答', at: now },
    ]
    record.messages = [
      { role: 'user', content: '问' },
      { role: 'assistant', content: '答' },
    ]
    store.save(record)

    assert.equal(store.truncateFromDisplayIndex(record.id, 1), null)
    assert.equal(store.truncateFromDisplayIndex(record.id, 9), null)
    assert.equal(store.truncateFromDisplayIndex('missing', 0), null)
  })
})
