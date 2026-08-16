/**
 * Subagent P0 — 工具过滤 / 契约 / 权限解析 / 级联 / 禁嵌套 / listActive 隐藏子会话
 * 依赖：先 npm run build -w @opptrix/shared && npm run build -w @opptrix/agent
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-subagent-'))
process.env.OPPTRIX_DATA_DIR = tmp

const {
  filterToolsForSubagent,
  filterToolNamesForSubagent,
  isSubagentBlockedTool,
  validateAgainstSchema,
  validateSubagentResult,
  resolveAuthSessionId,
  cascadeDeleteSubagents,
  SubagentRunRegistry,
  runSubagent,
  SessionStore,
  isSidebarSession,
  getSessionResumeBus,
  formatJobResumeMessage,
  listSubagentRunsForParent,
  pickSubagentModel,
} = await import('../packages/agent/dist/index.js')

test('filterTools 去掉 ask_user / run_subagent', () => {
  const names = [
    'get_current_time',
    'ask_user',
    'run_subagent',
    'list_subagents',
    'cancel_subagent',
    'get_subagent',
    'reclaim_subagent',
    'request_secret',
    'request_session_lan_access',
    'grant_session_secret',
    'workspace_read',
  ]
  const filtered = filterToolNamesForSubagent(names)
  assert.deepEqual(filtered, ['get_current_time', 'workspace_read'])
  assert.equal(isSubagentBlockedTool('ask_user'), true)
  assert.equal(isSubagentBlockedTool('run_subagent'), true)

  const tools = [
    { name: 'ask_user' },
    { function: { name: 'run_subagent' } },
    { name: 'workspace_read' },
  ]
  const ft = filterToolsForSubagent(tools)
  assert.equal(ft.length, 1)
  assert.equal(ft[0].name, 'workspace_read')
})

test('result_schema 校验成功/失败', () => {
  const schema = {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      score: { type: 'number' },
    },
    required: ['answer'],
    additionalProperties: false,
  }
  const ok = validateAgainstSchema({ answer: 'yes', score: 1 }, schema)
  assert.equal(ok.ok, true)

  const miss = validateAgainstSchema({ score: 1 }, schema)
  assert.equal(miss.ok, false)
  assert.ok(miss.errors.some(e => /answer/.test(e)))

  const fromReply = validateSubagentResult(
    '```json\n{"answer":"ok"}\n```',
    schema,
  )
  assert.equal(fromReply.ok, true)

  const badReply = validateSubagentResult('not json', schema)
  assert.equal(badReply.ok, false)
})

test('resolveAuthSessionId 子→父/root', () => {
  const map = new Map([
    ['root-1', { kind: 'user' }],
    ['child-1', { kind: 'subagent', parentSessionId: 'root-1', rootSessionId: 'root-1' }],
    ['child-2', { kind: 'subagent', parentSessionId: 'child-1', rootSessionId: 'root-1' }],
  ])
  const lookup = (id) => map.get(id) ?? null
  assert.equal(resolveAuthSessionId('root-1', lookup), 'root-1')
  assert.equal(resolveAuthSessionId('child-1', lookup), 'root-1')
  assert.equal(resolveAuthSessionId('child-2', lookup), 'root-1')
})

test('cascade：删父删子 runs', () => {
  const registry = new SubagentRunRegistry()
  const deletedChildren = []
  const cancelled = []
  const run = registry.create({
    parentSessionId: 'parent-a',
    rootSessionId: 'parent-a',
    childSessionId: 'child-a',
    role: { name: 'r', instructions: 'i' },
    task: 't',
    resultSchema: { type: 'object', properties: {} },
  })
  registry.setStatus(run.id, 'running', { startedAt: new Date().toISOString() })
  const n = cascadeDeleteSubagents(
    'parent-a',
    {
      cancelChildChat: (id) => cancelled.push(id),
      deleteChildSession: (id) => deletedChildren.push(id),
    },
    registry,
  )
  assert.equal(n, 1)
  assert.deepEqual(cancelled, ['child-a'])
  assert.deepEqual(deletedChildren, ['child-a'])
  assert.equal(registry.get(run.id), null)
})

test('子再调 run_subagent 拒绝', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父' })
  const child = store.create({
    title: '子',
    kind: 'subagent',
    parentSessionId: parent.id,
    rootSessionId: parent.id,
  })
  const registry = new SubagentRunRegistry()
  const result = await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      chat: async () => ({ reply: '{}', sessionId: child.id }),
    },
    {
      parentSessionId: child.id,
      role: { name: 'x', instructions: 'y' },
      task: 'z',
      result_schema: { type: 'object', properties: {} },
    },
    registry,
  )
  assert.equal(result.ok, false)
  assert.match(String(result.error ?? ''), /不能再委派/)
})

test('listActive 不含子会话', () => {
  const store = new SessionStore()
  const parent = store.create({ title: '用户会话' })
  store.create({
    title: '子任务',
    kind: 'subagent',
    parentSessionId: parent.id,
    rootSessionId: parent.id,
  })
  const active = store.listActive()
  assert.ok(active.some(s => s.id === parent.id))
  assert.ok(active.every(s => s.kind !== 'subagent'))
  assert.ok(active.every(s => !s.parentSessionId))
  assert.equal(isSidebarSession({ kind: 'subagent', parentSessionId: parent.id }), false)
  assert.equal(isSidebarSession({ kind: 'user' }), true)
})

test('pickSubagentModel 无效 role.model 回退父 model', () => {
  const resolveModelRef = (ref) => {
    if (ref === 'openai:gpt-4o' || ref === 'deepseek:chat') return ref
    return null
  }
  const host = { resolveModelRef }
  assert.equal(
    pickSubagentModel('随便写的模型名', 'openai:gpt-4o', host),
    'openai:gpt-4o',
  )
  assert.equal(
    pickSubagentModel('openai:gpt-4o', 'deepseek:chat', host),
    'openai:gpt-4o',
  )
  assert.equal(pickSubagentModel('无效', '也无效', host), undefined)
})

test('无效 role.model 回退父 model 仍可 chat（mock resolveModelRef）', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父-model', model: 'openai:gpt-4o' })
  const registry = new SubagentRunRegistry()
  let chatModelRef
  const resolveModelRef = (ref) => {
    if (ref === 'openai:gpt-4o' || ref === 'deepseek:chat') return ref
    return null
  }
  const result = await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      resolveModelRef,
      chat: async (sid, _msg, _progress, modelRef) => {
        chatModelRef = modelRef
        return {
          reply: '```json\n{"ok":true,"summary":"fallback ok"}\n```',
          sessionId: sid,
        }
      },
    },
    {
      parentSessionId: parent.id,
      role: {
        name: '分析员',
        instructions: '只输出 JSON',
        model: '随便填的模型名',
      },
      task: '测试回退',
      result_schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
        },
        required: ['ok'],
      },
      mode: 'foreground',
    },
    registry,
  )
  assert.equal(result.ok, true)
  assert.equal(result.status, 'completed')
  assert.equal(chatModelRef, 'openai:gpt-4o')
  const childId = result.child_session_id
  assert.ok(childId)
  assert.equal(store.get(childId)?.model, 'openai:gpt-4o')
})

test('有效 role.model 覆盖父 model', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父-override', model: 'openai:gpt-4o' })
  const registry = new SubagentRunRegistry()
  let chatModelRef
  const resolveModelRef = (ref) => {
    if (ref === 'openai:gpt-4o' || ref === 'deepseek:chat') return ref
    return null
  }
  const result = await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      resolveModelRef,
      chat: async (sid, _msg, _progress, modelRef) => {
        chatModelRef = modelRef
        return {
          reply: '```json\n{"ok":true,"summary":"override ok"}\n```',
          sessionId: sid,
        }
      },
    },
    {
      parentSessionId: parent.id,
      role: {
        name: '分析员',
        instructions: '只输出 JSON',
        model: 'deepseek:chat',
      },
      task: '测试覆盖',
      result_schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
        },
        required: ['ok'],
      },
      mode: 'foreground',
    },
    registry,
  )
  assert.equal(result.ok, true)
  assert.equal(chatModelRef, 'deepseek:chat')
  assert.equal(store.get(result.child_session_id)?.model, 'deepseek:chat')
})

test('run_subagent foreground 契约通过（mock chat）', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父会话' })
  const registry = new SubagentRunRegistry()
  let calls = 0
  const result = await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      chat: async (sid, msg) => {
        calls += 1
        assert.ok(store.get(sid)?.kind === 'subagent')
        if (calls === 1 && /契约校验失败/.test(msg)) {
          return { reply: '{"ok":true}', sessionId: sid }
        }
        return {
          reply: '```json\n{"ok":true,"summary":"done"}\n```',
          sessionId: sid,
        }
      },
    },
    {
      parentSessionId: parent.id,
      role: { name: '分析员', instructions: '只输出 JSON' },
      task: '总结要点',
      result_schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
        },
        required: ['ok'],
      },
      mode: 'foreground',
      label: '测试子任务',
    },
    registry,
  )
  assert.equal(result.ok, true)
  assert.equal(result.status, 'completed')
  assert.equal(result.result?.ok, true)
  assert.ok(result.run_id)
  const childMeta = store.listActive()
  assert.ok(!childMeta.some(s => s.kind === 'subagent'))
})

async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 20 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error('waitFor timeout')
}

test('同 label active 时 dedupe 复用 run', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父-dedupe' })
  const registry = new SubagentRunRegistry()
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, summary: { type: 'string' } },
    required: ['ok'],
  }
  let createCount = 0
  const host = {
    createSession: (opts) => {
      createCount += 1
      return store.create(opts)
    },
    getSession: (id) => store.get(id),
    chat: async (sid) => ({
      reply: '```json\n{"ok":true,"summary":"first"}\n```',
      sessionId: sid,
    }),
  }
  const first = await runSubagent(
    host,
    {
      parentSessionId: parent.id,
      role: { name: '分析', instructions: 'json' },
      task: '任务 A',
      result_schema: schema,
      mode: 'foreground',
      label: '基本面取证',
    },
    registry,
  )
  assert.equal(first.ok, true)
  assert.equal(first.deduped, undefined)
  assert.equal(createCount, 1)

  registry.setStatus(first.run_id, 'running', { startedAt: new Date().toISOString() })
  const second = await runSubagent(
    host,
    {
      parentSessionId: parent.id,
      role: { name: '分析', instructions: 'json' },
      task: '任务 B',
      result_schema: schema,
      mode: 'foreground',
      label: '基本面取证',
    },
    registry,
  )
  assert.equal(second.deduped, true)
  assert.equal(second.run_id, first.run_id)
  assert.equal(createCount, 1)
})

test('restart_run_id 复用 run_id + child_session 重启', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父-restart' })
  const registry = new SubagentRunRegistry()
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, summary: { type: 'string' } },
    required: ['ok'],
  }
  let chatCalls = 0
  const host = {
    createSession: (opts) => store.create(opts),
    getSession: (id) => store.get(id),
    chat: async (sid) => {
      chatCalls += 1
      if (chatCalls <= 2) {
        return { reply: 'not-json', sessionId: sid }
      }
      return {
        reply: '```json\n{"ok":true,"summary":"restarted ok"}\n```',
        sessionId: sid,
      }
    },
  }
  const failed = await runSubagent(
    host,
    {
      parentSessionId: parent.id,
      role: { name: 'r', instructions: 'json' },
      task: '第一次',
      result_schema: schema,
      mode: 'foreground',
      label: '可重启任务',
    },
    registry,
  )
  assert.equal(failed.ok, false)
  assert.equal(failed.status, 'failed')
  const childId = failed.child_session_id
  assert.ok(childId)

  const restarted = await runSubagent(
    host,
    {
      parentSessionId: parent.id,
      role: { name: 'r', instructions: 'json' },
      task: '第二次',
      result_schema: schema,
      mode: 'foreground',
      label: '可重启任务',
      restart_run_id: failed.run_id,
    },
    registry,
  )
  assert.equal(restarted.restarted, true)
  assert.equal(restarted.run_id, failed.run_id)
  assert.equal(restarted.child_session_id, childId)
  assert.equal(restarted.ok, true)
  assert.equal(restarted.status, 'completed')
  assert.equal(restarted.result?.summary, 'restarted ok')
})

test('subagent_child_progress 透传 thinking/tool 事件', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父-child-progress' })
  const registry = new SubagentRunRegistry()
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, summary: { type: 'string' } },
    required: ['ok'],
  }
  const events = []
  await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      chat: async (sid, _msg, progress) => {
        progress?.onProgress?.({
          type: 'thinking',
          round: 1,
          label: '子任务思考中',
        })
        progress?.onProgress?.({
          type: 'tool_start',
          step: {
            id: 's1',
            tool: 'get_instrument_snapshot',
            label: '获取标的快照',
            status: 'running',
            startedAt: new Date().toISOString(),
          },
        })
        progress?.onProgress?.({
          type: 'tool_done',
          step: {
            id: 's1',
            tool: 'get_instrument_snapshot',
            label: '获取标的快照',
            status: 'done',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          },
        })
        return {
          reply: '```json\n{"ok":true,"summary":"ok"}\n```',
          sessionId: sid,
        }
      },
    },
    {
      parentSessionId: parent.id,
      role: { name: 'p', instructions: 'json' },
      task: '进度',
      result_schema: schema,
      mode: 'foreground',
      label: '进度任务',
      emit: (e) => events.push(e),
    },
    registry,
  )
  const childEvents = events.filter(e => e.type === 'subagent_child_progress')
  assert.ok(childEvents.length >= 3)
  for (const e of childEvents) {
    assert.ok(e.run_id)
    assert.ok(e.child_session_id)
    assert.ok(e.child)
  }
  assert.ok(childEvents.some(e => e.child?.type === 'thinking'))
  assert.ok(childEvents.some(e => e.child?.type === 'tool_start'))
  assert.ok(childEvents.some(e => e.child?.type === 'tool_done'))
})

test('formatJobResumeMessage subagent_terminal 文案', () => {
  const msg = formatJobResumeMessage({
    sessionId: 's1',
    cause: 'subagent_terminal',
    prompt: '请处理协作任务结果',
    jobId: 'run-1',
  }, '2026-01-01T00:00:00.000Z')
  assert.match(msg, /协作任务已结束/)
  assert.match(msg, /resume_cause: subagent_terminal/)
  assert.match(msg, /job_id: run-1/)
})

test('background completed → enqueue subagent_terminal；foreground 不 enqueue', async () => {
  const bus = getSessionResumeBus()
  bus.resetForTests()
  const enqueued = []
  bus.configureRuntime({
    isSessionAlive: () => true,
    isChatBusy: () => false,
  })
  bus.setHandler(async (req) => {
    enqueued.push(req)
  })

  const store = new SessionStore()
  const parent = store.create({ title: '父-bg' })
  const registry = new SubagentRunRegistry()
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, summary: { type: 'string' } },
    required: ['ok'],
  }
  const host = {
    createSession: (opts) => store.create(opts),
    getSession: (id) => store.get(id),
    chat: async (sid) => ({
      reply: '```json\n{"ok":true,"summary":"后台完成"}\n```',
      sessionId: sid,
    }),
  }

  const bg = await runSubagent(
    host,
    {
      parentSessionId: parent.id,
      role: { name: 'bg', instructions: 'json' },
      task: '后台任务',
      result_schema: schema,
      mode: 'background',
      label: '后台协作',
    },
    registry,
  )
  assert.equal(bg.status, 'queued')
  assert.ok(bg.run_id)
  await waitFor(() => registry.get(bg.run_id)?.status === 'completed')
  await waitFor(() => enqueued.length >= 1)
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0].cause, 'subagent_terminal')
  assert.equal(enqueued[0].sessionId, parent.id)
  assert.equal(enqueued[0].jobId, bg.run_id)
  assert.match(String(enqueued[0].prompt), /get_subagent/)
  assert.match(String(enqueued[0].prompt), /后台协作/)

  const listed = listSubagentRunsForParent(parent.id, registry)
  assert.equal(listed.length, 1)
  assert.equal(listed[0].mode, 'background')
  assert.ok(listed[0].child_session_id)

  const beforeFg = enqueued.length
  const fg = await runSubagent(
    host,
    {
      parentSessionId: parent.id,
      role: { name: 'fg', instructions: 'json' },
      task: '前台任务',
      result_schema: schema,
      mode: 'foreground',
      label: '前台协作',
    },
    registry,
  )
  assert.equal(fg.status, 'completed')
  await new Promise(r => setTimeout(r, 50))
  assert.equal(enqueued.length, beforeFg)

  bus.resetForTests()
})

test('background failed / cancelled → 均 enqueue resume', async () => {
  const bus = getSessionResumeBus()
  bus.resetForTests()
  const enqueued = []
  bus.configureRuntime({
    isSessionAlive: () => true,
    isChatBusy: () => false,
  })
  bus.setHandler(async (req) => {
    enqueued.push(req)
  })

  const store = new SessionStore()
  const parent = store.create({ title: '父-fail' })
  const registry = new SubagentRunRegistry()
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
  }

  const failed = await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      chat: async () => {
        throw new Error('模拟失败')
      },
    },
    {
      parentSessionId: parent.id,
      role: { name: 'fail', instructions: 'json' },
      task: '会失败',
      result_schema: schema,
      mode: 'background',
      label: '失败任务',
    },
    registry,
  )
  assert.equal(failed.status, 'queued')
  await waitFor(() => registry.get(failed.run_id)?.status === 'failed')
  await waitFor(() => enqueued.some(r => r.jobId === failed.run_id))
  assert.ok(enqueued.some(r => r.jobId === failed.run_id && r.cause === 'subagent_terminal'))
  assert.match(String(enqueued.find(r => r.jobId === failed.run_id)?.prompt), /run_subagent|勿 poll/)

  const ac = new AbortController()
  ac.abort()
  const cancelled = await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      chat: async () => {
        throw new Error('不应执行到 chat')
      },
    },
    {
      parentSessionId: parent.id,
      role: { name: 'cancel', instructions: 'json' },
      task: '会取消',
      result_schema: schema,
      mode: 'background',
      label: '取消任务',
      signal: ac.signal,
    },
    registry,
  )
  assert.equal(cancelled.status, 'queued')
  await waitFor(() => {
    const st = registry.get(cancelled.run_id)?.status
    return st === 'cancelled' || st === 'failed'
  })
  await waitFor(() => enqueued.some(r => r.jobId === cancelled.run_id))
  const cancelReq = enqueued.find(r => r.jobId === cancelled.run_id)
  assert.ok(cancelReq)
  assert.equal(cancelReq.cause, 'subagent_terminal')
  assert.match(String(cancelReq.prompt), /已停止/)
  assert.match(String(cancelReq.prompt), /run_subagent|勿 poll/)

  bus.resetForTests()
})

test('ResumeBus busy-defer × subagent_terminal：busy 时 defer，空闲后 fire', async () => {
  // cancelled 不 enqueue 已覆盖于上一用例；此处专测 cause=subagent_terminal 的 busy-defer
  const bus = getSessionResumeBus()
  bus.resetForTests()
  let calls = 0
  let busy = true
  bus.configureRuntime({
    isSessionAlive: () => true,
    isChatBusy: () => busy,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 15)),
    clearTimeout,
  })
  bus.setHandler(async (req) => {
    calls += 1
    assert.equal(req.cause, 'subagent_terminal')
  })
  bus.enqueue({
    sessionId: 'parent-busy-sa',
    cause: 'subagent_terminal',
    prompt: '请用 get_subagent 取回协作结果',
    jobId: 'run-busy-sa',
  })
  assert.equal(calls, 0)
  busy = false
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(calls, 1)
  bus.resetForTests()
})

test('progress 事件含 child_session_id 与 mode', async () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父-progress' })
  const registry = new SubagentRunRegistry()
  const events = []
  await runSubagent(
    {
      createSession: (opts) => store.create(opts),
      getSession: (id) => store.get(id),
      chat: async (sid) => ({
        reply: '```json\n{"ok":true,"summary":"ok"}\n```',
        sessionId: sid,
      }),
    },
    {
      parentSessionId: parent.id,
      role: { name: 'p', instructions: 'json' },
      task: '进度',
      result_schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, summary: { type: 'string' } },
        required: ['ok'],
      },
      mode: 'foreground',
      label: '进度任务',
      emit: (e) => events.push(e),
    },
    registry,
  )
  const started = events.find(e => e.type === 'subagent_started')
  const done = events.find(e => e.type === 'subagent_done')
  assert.ok(started?.child_session_id)
  assert.equal(started?.mode, 'foreground')
  assert.ok(done?.child_session_id)
  assert.equal(done?.mode, 'foreground')
})

test.after(() => {
  try {
    getSessionResumeBus().resetForTests()
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})
