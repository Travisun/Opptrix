/**
 * 续跑注入 origin 贯穿 toDisplayMessages；UI 启发判定纯函数
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SessionStore,
  isWakeResumeDisplayMessage,
} from '../packages/agent/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-wake-resume-'))
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

test('isWakeResumeDisplayMessage: origin and legacy prefix', () => {
  assert.equal(isWakeResumeDisplayMessage({ origin: 'wake_resume', role: 'user', content: 'x' }), true)
  assert.equal(
    isWakeResumeDisplayMessage({
      role: 'user',
      content: '系统续跑：定时器已到期，请按下列说明继续',
    }),
    true,
  )
  assert.equal(isWakeResumeDisplayMessage({ role: 'user', content: '帮我看看茅台' }), false)
  assert.equal(isWakeResumeDisplayMessage({ role: 'assistant', content: '系统续跑：假' }), false)
  assert.equal(isWakeResumeDisplayMessage({}), false)
})

test('toDisplayMessages passes origin wake_resume; omits when absent', async () => {
  await withTempStore(async () => {
    const store = new SessionStore()
    const record = store.create({ title: '续跑展示' })
    const now = new Date().toISOString()
    record.turns = [
      { role: 'user', content: '普通提问', at: now },
      {
        role: 'user',
        content: '系统续跑：后台任务完成，请继续',
        at: now,
        origin: 'wake_resume',
      },
      { role: 'assistant', content: '继续分析…', at: now },
    ]
    record.messages = [
      { role: 'user', content: '普通提问' },
      { role: 'user', content: '系统续跑：后台任务完成，请继续' },
      { role: 'assistant', content: '继续分析…' },
    ]
    store.save(record)

    const display = store.toDisplayMessages(store.get(record.id))
    assert.equal(display.length, 3)
    assert.equal(display[0].origin, undefined)
    assert.equal(display[1].origin, 'wake_resume')
    assert.equal(display[1].content.startsWith('系统续跑'), true)
    assert.equal(isWakeResumeDisplayMessage(display[1]), true)
    assert.equal(isWakeResumeDisplayMessage(display[0]), false)
  })
})
