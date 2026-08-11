/**
 * 终轮 reasoningContent 写入 turns，并能经 toDisplayMessages / 回填露出
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SessionStore } from '../packages/agent/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-session-reasoning-'))
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

test('toDisplayMessages surfaces turn reasoningContent', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '思考持久化' })
    const now = new Date().toISOString()
    record.turns = [
      { role: 'user', content: '问', at: now },
      {
        role: 'assistant',
        content: '答',
        at: now,
        reasoningContent: '先看趋势再下结论',
      },
    ]
    record.messages = [
      { role: 'user', content: '问' },
      { role: 'assistant', content: '答', reasoningContent: '先看趋势再下结论' },
    ]
    store.save(record)

    const display = store.toDisplayMessages(store.get(record.id))
    assert.equal(display.length, 2)
    assert.equal(display[1].reasoningContent, '先看趋势再下结论')
  })
})

test('normalize backfills missing turn reasoning from final assistant message', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '思考回填' })
    const now = new Date().toISOString()
    record.turns = [
      { role: 'user', content: '问', at: now },
      { role: 'assistant', content: '答', at: now },
    ]
    record.messages = [
      { role: 'user', content: '问' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{}' } }],
        reasoningContent: '',
      },
      { role: 'tool', tool_call_id: 'c1', name: 'search', content: '{}' },
      { role: 'assistant', content: '答', reasoningContent: '工具后再答' },
    ]
    store.save(record)

    const loaded = store.get(record.id)
    assert.ok(loaded)
    assert.equal(loaded.turns[1].reasoningContent, '工具后再答')
    const display = store.toDisplayMessages(loaded)
    assert.equal(display[1].reasoningContent, '工具后再答')
  })
})

test('empty reasoning does not appear on display turns', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '无思考' })
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

    const display = store.toDisplayMessages(store.get(record.id))
    assert.equal(display[1].reasoningContent, undefined)
  })
})
