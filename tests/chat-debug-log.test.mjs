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
  pruneChatDebugLogDir,
  resetChatDebugLogCacheForTests,
  resolveChatDebugLogDir,
  resolveChatDebugLogPath,
  rotateChatDebugLogIfNeeded,
  setChatDebugLogLimitsForTests,
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

function enableChatDebug() {
  getUserDataStore().setDocument('preference', CHAT_DEBUG_LOGGING_KEY, { enabled: true })
  resetChatDebugLogCacheForTests()
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

test('rotateChatDebugLogIfNeeded renames oversized file to .1', async () => {
  await withTempStore(async () => {
    enableChatDebug()
    const logPath = resolveChatDebugLogPath('sess-rotate')
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.writeFileSync(logPath, 'x'.repeat(500), 'utf8')
    assert.equal(rotateChatDebugLogIfNeeded(logPath, 200), true)
    assert.equal(fs.existsSync(logPath), false)
    assert.equal(fs.existsSync(`${logPath}.1`), true)
    assert.equal(fs.statSync(`${logPath}.1`).size, 500)

    // 再次超限：覆盖旧 `.1`，不无限堆积
    fs.writeFileSync(logPath, 'y'.repeat(300), 'utf8')
    assert.equal(rotateChatDebugLogIfNeeded(logPath, 200), true)
    assert.equal(fs.existsSync(logPath), false)
    assert.equal(fs.readFileSync(`${logPath}.1`, 'utf8'), 'y'.repeat(300))
  })
})

test('append rotates when file exceeds limit (enabled debug is bounded)', async () => {
  await withTempStore(async () => {
    enableChatDebug()
    setChatDebugLogLimitsForTests({
      maxFileBytes: 400,
      maxSessionFiles: 40,
      maxDirBytes: 10 * 1024 * 1024,
      dirPruneEvery: 1000,
    })
    const sid = 'sess-big'
    const pad = 'p'.repeat(80)
    for (let i = 0; i < 20; i++) {
      logChatDebugRoundStart(sid, { round: i + 1, model: pad })
    }
    const logPath = resolveChatDebugLogPath(sid)
    assert.equal(fs.existsSync(logPath), true)
    assert.ok(fs.statSync(logPath).size < 400, 'active file stays under limit after rotate')
    assert.equal(fs.existsSync(`${logPath}.1`), true)
    // 开启 debug 也不会无限膨胀：最多 active + 一个 `.1`
    const dir = resolveChatDebugLogDir()
    const siblings = fs.readdirSync(dir).filter(n => n.startsWith('sess-big'))
    assert.deepEqual(siblings.sort(), ['sess-big.jsonl', 'sess-big.jsonl.1'].sort())
  })
})

test('pruneChatDebugLogDir removes oldest sessions under soft caps', async () => {
  await withTempStore(async () => {
    enableChatDebug()
    const dir = resolveChatDebugLogDir()
    fs.mkdirSync(dir, { recursive: true })
    const older = path.join(dir, 'old.jsonl')
    const mid = path.join(dir, 'mid.jsonl')
    const newer = path.join(dir, 'new.jsonl')
    fs.writeFileSync(older, '{"event":"old"}\n', 'utf8')
    fs.writeFileSync(mid, '{"event":"mid"}\n', 'utf8')
    fs.writeFileSync(newer, '{"event":"new"}\n', 'utf8')
    const t0 = Date.now() - 60_000
    fs.utimesSync(older, t0 / 1000, t0 / 1000)
    fs.utimesSync(mid, (t0 + 10_000) / 1000, (t0 + 10_000) / 1000)
    fs.utimesSync(newer, (t0 + 20_000) / 1000, (t0 + 20_000) / 1000)

    const removed = pruneChatDebugLogDir(dir, {
      maxSessionFiles: 2,
      maxDirBytes: 10 * 1024 * 1024,
      keepPath: newer,
    })
    assert.ok(removed >= 1)
    assert.equal(fs.existsSync(older), false)
    assert.equal(fs.existsSync(mid), true)
    assert.equal(fs.existsSync(newer), true)
  })
})

test('append prunes oldest sessions when over maxSessionFiles', async () => {
  await withTempStore(async () => {
    enableChatDebug()
    setChatDebugLogLimitsForTests({
      maxFileBytes: 12 * 1024 * 1024,
      maxSessionFiles: 2,
      maxDirBytes: 50 * 1024 * 1024,
      dirPruneEvery: 1,
    })
    const dir = resolveChatDebugLogDir()
    fs.mkdirSync(dir, { recursive: true })
    const a = path.join(dir, 'a.jsonl')
    const b = path.join(dir, 'b.jsonl')
    fs.writeFileSync(a, 'a\n', 'utf8')
    fs.writeFileSync(b, 'b\n', 'utf8')
    const t0 = Date.now() - 30_000
    fs.utimesSync(a, t0 / 1000, t0 / 1000)
    fs.utimesSync(b, (t0 + 5_000) / 1000, (t0 + 5_000) / 1000)

    logChatDebugRoundStart('c', { round: 1, model: 'm' })
    assert.equal(fs.existsSync(resolveChatDebugLogPath('c')), true)
    assert.equal(fs.existsSync(a), false, 'oldest session pruned')
    assert.equal(fs.existsSync(b), true)
  })
})
