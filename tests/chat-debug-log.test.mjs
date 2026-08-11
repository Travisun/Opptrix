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
  logChatDebugRoundEnd,
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

    logChatDebugRoundStart('sess-a', {
      round: 1,
      model: 'test:model',
      promptCacheKey: 'opptrix-session:sess-a',
      cacheWarmth: 'unknown',
    })
    const logPath = resolveChatDebugLogPath('sess-a')
    assert.equal(fs.existsSync(logPath), true)
    const line = fs.readFileSync(logPath, 'utf8').trim()
    const parsed = JSON.parse(line)
    assert.equal(parsed.event, 'round_start')
    assert.equal(parsed.sessionId, 'sess-a')
    assert.equal(parsed.model, 'test:model')
    assert.equal(parsed.round, 1)
    assert.equal(parsed.promptCacheKey, 'opptrix-session:sess-a')
    assert.equal(parsed.cacheWarmth, 'unknown')
    assert.ok(!JSON.stringify(parsed).toLowerCase().includes('authorization'))
    assert.ok(!Object.keys(parsed).some(k => /api.?key|token|authorization/i.test(k)))

    logChatDebugRoundEnd('sess-a', {
      finishReason: 'stop',
      contentLen: 12,
      promptCacheKey: 'opptrix-session:sess-a',
      cacheWarmth: 'warm',
      usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, cachedPromptTokens: 80 },
    })
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n')
    assert.equal(lines.length, 2)
    const end = JSON.parse(lines[1])
    assert.equal(end.event, 'round_end')
    assert.equal(end.promptCacheKey, 'opptrix-session:sess-a')
    assert.equal(end.cacheWarmth, 'warm')
    assert.equal(end.usage.cachedPromptTokens, 80)
    assert.ok(!JSON.stringify(end).toLowerCase().includes('bearer'))
  })
})
