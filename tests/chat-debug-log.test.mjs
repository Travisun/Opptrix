/**
 * 对话调试日志 — truncate / parse / 默认关闭 / 落盘
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CHAT_DEBUG_LOGGING_KEY,
  DEFAULT_CHAT_DEBUG_LOGGING,
  parseChatDebugLoggingSettings,
} from '../packages/shared/dist/chat-debug-settings.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'
import {
  isChatDebugLoggingEnabled,
  logChatDebugRoundStart,
  resetChatDebugLogCacheForTests,
  resolveChatDebugLogPath,
  truncateForChatDebug,
} from '../packages/agent/dist/chat-debug-log.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-chat-debug-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  getUserDataStore().close()
  resetChatDebugLogCacheForTests()
  return fn(tmp).finally(() => {
    resetChatDebugLogCacheForTests()
    getUserDataStore().close()
    fs.rmSync(tmp, { recursive: true, force: true })
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
  })
}

test('parseChatDebugLoggingSettings defaults to disabled', () => {
  assert.deepEqual(parseChatDebugLoggingSettings(null), DEFAULT_CHAT_DEBUG_LOGGING)
  assert.deepEqual(parseChatDebugLoggingSettings(undefined), { enabled: false })
  assert.deepEqual(parseChatDebugLoggingSettings({}), { enabled: false })
  assert.deepEqual(parseChatDebugLoggingSettings({ enabled: false }), { enabled: false })
  assert.deepEqual(parseChatDebugLoggingSettings({ enabled: true }), { enabled: true })
  assert.deepEqual(parseChatDebugLoggingSettings({ enabled: 'yes' }), { enabled: false })
  assert.equal(CHAT_DEBUG_LOGGING_KEY, 'chat_debug_logging')
})

test('truncateForChatDebug caps long strings', () => {
  assert.equal(truncateForChatDebug('short'), 'short')
  const long = 'x'.repeat(5000)
  const out = truncateForChatDebug(long, 4096)
  assert.ok(out.startsWith('x'.repeat(4096)))
  assert.match(out, /\…\[\+\d+\]$/)
  assert.ok(out.length < long.length)
})

test('isChatDebugLoggingEnabled defaults false and writes only when enabled', async () => {
  await withTempStore(async () => {
    assert.equal(isChatDebugLoggingEnabled(), false)
    logChatDebugRoundStart('sess-a', { round: 1, model: 'test:model' })
    assert.equal(fs.existsSync(resolveChatDebugLogPath('sess-a')), false)

    getUserDataStore().setDocument('preference', CHAT_DEBUG_LOGGING_KEY, { enabled: true })
    resetChatDebugLogCacheForTests()
    assert.equal(isChatDebugLoggingEnabled(), true)

    logChatDebugRoundStart('sess-a', { round: 1, model: 'test:model' })
    const logPath = resolveChatDebugLogPath('sess-a')
    assert.equal(fs.existsSync(logPath), true)
    const line = fs.readFileSync(logPath, 'utf8').trim()
    const parsed = JSON.parse(line)
    assert.equal(parsed.event, 'round_start')
    assert.equal(parsed.sessionId, 'sess-a')
    assert.equal(parsed.model, 'test:model')
    assert.equal(parsed.round, 1)
    assert.ok(!JSON.stringify(parsed).toLowerCase().includes('authorization'))
    assert.ok(!Object.keys(parsed).some(k => /api.?key|token|authorization/i.test(k)))
  })
})
