/**
 * Self-Harness — 主会话回合后异步进化（session-evolve）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-harness-evolve-'))
const prevData = process.env.OPPTRIX_DATA_DIR
const prevEnv = process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
process.env.OPPTRIX_DATA_DIR = tmp
delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE

const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
getUserDataStore().close()

const agent = await import('../packages/agent/dist/index.js')

const {
  evolveHarnessFromSessionSyncForTests,
  scheduleHarnessEvolveAfterTurn,
  resetHarnessSessionEvolveForTests,
  rollbackHarnessToDefault,
  setHarnessAutoPromote,
  isHarnessAutoPromoteEnabled,
  loadHarnessStore,
  getActiveHarnessVersionForModel,
} = agent

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE_SRC = path.join(ROOT, 'packages/agent/src/engine.ts')

function toolErrorTurns() {
  return [
    {
      role: 'user',
      content: '茅台多少钱',
      at: '2026-08-16T01:00:00.000Z',
    },
    {
      role: 'assistant',
      content: '暂时无法完成',
      at: '2026-08-16T01:00:01.000Z',
      toolsUsed: ['query_instrument'],
      toolSteps: [
        {
          id: 'step-1',
          tool: 'query_instrument',
          label: '查询行情',
          status: 'error',
          resultPreview: '{"error":"暂时无法获取数据"}',
          startedAt: '2026-08-16T01:00:01.000Z',
          finishedAt: '2026-08-16T01:00:02.000Z',
        },
      ],
    },
  ]
}

function makeSession(overrides = {}) {
  return {
    id: 'sess-evolve-1',
    title: '测试',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T01:00:00.000Z',
    model: 'deepseek:chat',
    kind: 'user',
    messages: [],
    turns: toolErrorTurns(),
    ...overrides,
  }
}

test.beforeEach(() => {
  resetHarnessSessionEvolveForTests()
  rollbackHarnessToDefault()
  rollbackHarnessToDefault('deepseek:chat')
  setHarnessAutoPromote(true)
  delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
})

test('engine: lab not in sync chat stack — only scheduleHarnessEvolveAfterTurn', () => {
  const src = fs.readFileSync(ENGINE_SRC, 'utf8')
  assert.match(src, /scheduleHarnessEvolveAfterTurn/)
  assert.doesNotMatch(src, /runHarnessLab\s*\(/)
  assert.match(src, /await emitDone\(\{ reply \}\)/)
  // schedule 出现在 emitDone 之后的成功路径附近
  const doneIdx = src.indexOf("await emitDone({ reply })")
  const schedIdx = src.indexOf('scheduleHarnessEvolveAfterTurn', doneIdx)
  assert.ok(doneIdx >= 0 && schedIdx > doneIdx)
})

test('sync evolve: weakness turns → may promote when auto on', () => {
  const session = makeSession()
  const out = evolveHarnessFromSessionSyncForTests(session.id, () => session)
  assert.equal('skipped' in out && out.skipped, false)
  assert.ok(out.promoted, `expected promote, got skipReason=${out.skipReason}`)
  const active = getActiveHarnessVersionForModel(session.model)
  assert.ok(active)
  assert.equal(active.id, out.promoted.id)
  const store = loadHarnessStore()
  assert.ok(store.auditLog.some(e => e.action === 'promote_auto'))
})

test('sync evolve: auto off → no promote', () => {
  setHarnessAutoPromote(false)
  assert.equal(isHarnessAutoPromoteEnabled(), false)
  const session = makeSession()
  const before = getActiveHarnessVersionForModel(session.model)
  assert.equal(before, null)
  const out = evolveHarnessFromSessionSyncForTests(session.id, () => session)
  assert.equal(out.skipped, true)
  assert.equal(out.reason, 'auto_promote_disabled')
  assert.equal(getActiveHarnessVersionForModel(session.model), null)
  setHarnessAutoPromote(true)
})

test('sync evolve: env off → no promote', () => {
  process.env.OPPTRIX_HARNESS_AUTO_PROMOTE = '0'
  assert.equal(isHarnessAutoPromoteEnabled(), false)
  const session = makeSession()
  const out = evolveHarnessFromSessionSyncForTests(session.id, () => session)
  assert.equal(out.skipped, true)
  assert.equal(out.reason, 'auto_promote_disabled')
  delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
})

test('sync evolve: no_weakness skip', () => {
  const session = makeSession({
    turns: [
      { role: 'user', content: '你好', at: '2026-08-16T01:00:00.000Z' },
      { role: 'assistant', content: '你好，我可以帮你看行情。', at: '2026-08-16T01:00:01.000Z' },
    ],
  })
  const out = evolveHarnessFromSessionSyncForTests(session.id, () => session)
  assert.equal(out.skipped, true)
  assert.equal(out.reason, 'no_weakness')
  const store = loadHarnessStore()
  assert.ok(store.auditLog.some(e => e.action === 'skip_auto_promote' && e.detail === 'no_weakness'))
})

test('sync evolve: cooldown after successful promote', () => {
  const session = makeSession()
  const first = evolveHarnessFromSessionSyncForTests(session.id, () => session)
  assert.ok(first.promoted)
  const second = evolveHarnessFromSessionSyncForTests(session.id, () => session)
  assert.equal(second.skipped, true)
  assert.equal(second.reason, 'cooldown')
  const store = loadHarnessStore()
  assert.ok(store.auditLog.some(e => e.action === 'skip_auto_promote' && e.detail === 'cooldown'))
})

test('sync evolve: subagent session skipped', () => {
  const session = makeSession({ kind: 'subagent', parentSessionId: 'parent-1' })
  const out = evolveHarnessFromSessionSyncForTests(session.id, () => session, {
    isSubSession: true,
  })
  assert.equal(out.skipped, true)
  assert.equal(out.reason, 'sub_session')
})

test('scheduleHarnessEvolveAfterTurn is async (lab not sync)', async () => {
  resetHarnessSessionEvolveForTests()
  rollbackHarnessToDefault()
  const session = makeSession({ id: 'sess-async-1' })
  let ran = false
  scheduleHarnessEvolveAfterTurn(session.id, () => {
    ran = true
    return session
  })
  assert.equal(ran, false, 'must not run synchronously in schedule caller')
  await new Promise(r => setImmediate(r))
  await new Promise(r => setImmediate(r))
  assert.equal(ran, true)
  const active = getActiveHarnessVersionForModel(session.model)
  assert.ok(active)
})

test.after(() => {
  try {
    getUserDataStore().close()
  } catch {
    /* ignore */
  }
  if (prevData == null) delete process.env.OPPTRIX_DATA_DIR
  else process.env.OPPTRIX_DATA_DIR = prevData
  if (prevEnv == null) delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
  else process.env.OPPTRIX_HARNESS_AUTO_PROMOTE = prevEnv
  fs.rmSync(tmp, { recursive: true, force: true })
})
