/**
 * Subagent P0/P1 — ask_user 旁路、父 cancel 无活跃 chat、enqueueSteer readonly、needs_parent
 * 依赖：先 npm run build -w @opptrix/agent
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-subagent-sec-'))
process.env.OPPTRIX_DATA_DIR = tmp

const {
  subagentBlockedToolError,
  cancelRunningSubagentsForParent,
  SubagentRunRegistry,
  markRunNeedsParentAction,
  getSubagentRunResult,
  reclaimSubagentRun,
  SessionStore,
} = await import('../packages/agent/dist/index.js')

test('subagentBlockedToolError(ask_user) 含 needs_parent_action 且不挂起语义', () => {
  const blocked = subagentBlockedToolError('ask_user')
  assert.equal(blocked.ok, false)
  assert.ok(blocked.error)
  assert.equal(blocked.needs_parent_action.kind, 'confirm')
  assert.match(blocked.needs_parent_action.message, /ask_user|父/)
})

test('cancelRunningSubagentsForParent：无活跃 chat 仍取消 running background', () => {
  const registry = new SubagentRunRegistry()
  const cancelledChildren = []
  const run = registry.create({
    parentSessionId: 'parent-stop',
    rootSessionId: 'parent-stop',
    childSessionId: 'child-bg',
    role: { name: 'r', instructions: 'i' },
    task: 't',
    resultSchema: { type: 'object', properties: {} },
    mode: 'background',
  })
  registry.setStatus(run.id, 'running', { startedAt: new Date().toISOString() })

  const n = cancelRunningSubagentsForParent(
    'parent-stop',
    {
      cancelChildChat: (id) => cancelledChildren.push(id),
    },
    registry,
  )
  assert.equal(n, 1)
  assert.deepEqual(cancelledChildren, ['child-bg'])
  assert.equal(registry.get(run.id)?.status, 'cancelled')
})

test('markRunNeedsParentAction 将 running 标为 needs_parent_action', () => {
  const registry = new SubagentRunRegistry()
  const run = registry.create({
    parentSessionId: 'p-need',
    rootSessionId: 'p-need',
    childSessionId: 'c-need',
    role: { name: 'r', instructions: 'i' },
    task: 't',
    resultSchema: { type: 'object', properties: {} },
  })
  registry.setStatus(run.id, 'running', { startedAt: new Date().toISOString() })

  const updated = markRunNeedsParentAction(
    'c-need',
    { kind: 'confirm', message: '需要父确认' },
    { parentSessionId: 'p-need', registry, notifyParent: false },
  )
  assert.ok(updated)
  assert.equal(updated.status, 'needs_parent_action')
  assert.equal(updated.needsParentAction?.kind, 'confirm')
})

test('get_subagent / reclaim 校验 parentSessionId', () => {
  const registry = new SubagentRunRegistry()
  const run = registry.create({
    parentSessionId: 'parent-a',
    rootSessionId: 'parent-a',
    childSessionId: 'child-a',
    role: { name: 'r', instructions: 'i' },
    task: 't',
    resultSchema: { type: 'object', properties: {} },
  })
  registry.setStatus(run.id, 'completed', {
    finishedAt: new Date().toISOString(),
    result: { ok: true },
    summary: 'done',
  })

  const wrong = getSubagentRunResult(run.id, {
    parentSessionId: 'other-parent',
    registry,
  })
  assert.equal(wrong.ok, false)
  assert.match(String(wrong.error ?? ''), /不属于/)

  const ok = getSubagentRunResult(run.id, {
    parentSessionId: 'parent-a',
    registry,
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.status, 'completed')

  const reclaimWrong = reclaimSubagentRun(run.id, {
    parentSessionId: 'other-parent',
    registry,
  })
  assert.equal(reclaimWrong.ok, false)

  const reclaimOk = reclaimSubagentRun(run.id, {
    parentSessionId: 'parent-a',
    registry,
  })
  assert.equal(reclaimOk.ok, true)
})

test('reclaim 运行中/queued 拒绝；get 异父拒绝', () => {
  const registry = new SubagentRunRegistry()
  const run = registry.create({
    parentSessionId: 'parent-run',
    rootSessionId: 'parent-run',
    childSessionId: 'child-run',
    role: { name: 'r', instructions: 'i' },
    task: 't',
    resultSchema: { type: 'object', properties: {} },
  })
  registry.setStatus(run.id, 'running', { startedAt: new Date().toISOString() })

  const getWrong = getSubagentRunResult(run.id, {
    parentSessionId: 'not-owner',
    registry,
  })
  assert.equal(getWrong.ok, false)
  assert.match(String(getWrong.error ?? ''), /不属于/)

  const reclaimRunning = reclaimSubagentRun(run.id, {
    parentSessionId: 'parent-run',
    registry,
  })
  assert.equal(reclaimRunning.ok, false)
  assert.equal(reclaimRunning.status, 'running')
  assert.match(String(reclaimRunning.error ?? ''), /cancel_subagent|运行中/)

  registry.setStatus(run.id, 'queued')
  const reclaimQueued = reclaimSubagentRun(run.id, {
    parentSessionId: 'parent-run',
    registry,
  })
  assert.equal(reclaimQueued.ok, false)
  assert.equal(reclaimQueued.status, 'queued')
})

test('SessionStore 子会话可识别（REST 403 判定同源）', () => {
  const store = new SessionStore()
  const parent = store.create({ title: '父' })
  const child = store.create({
    title: '协作',
    kind: 'subagent',
    parentSessionId: parent.id,
    rootSessionId: parent.id,
  })
  assert.equal(child.kind, 'subagent')
  assert.equal(child.parentSessionId, parent.id)
  assert.ok(child.kind === 'subagent' || Boolean(child.parentSessionId))
})

test.after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})
