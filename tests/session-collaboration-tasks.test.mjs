/**
 * 父会话协作任务条 — 纯函数（progress / dismiss / 文案 / dto 映射）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySubagentProgressToTasks,
  collaborationStatusHint,
  dismissCollaborationTask,
  dtoToCollaborationTask,
  isActiveCollaborationStatus,
  isTerminalCollaborationStatus,
  mergeCollaborationTasksFromApi,
  shouldShowCollaborationTask,
  upsertCollaborationTask,
} from '../client-ui/src/chat/sessionCollaborationTasks.ts'

describe('sessionCollaborationTasks', () => {
  it('dtoToCollaborationTask 映射 child_session_id → childSessionId', () => {
    const task = dtoToCollaborationTask({
      run_id: 'r1',
      label: '调研甲',
      status: 'running',
      child_session_id: '  child-xyz  ',
      mode: 'background',
      updated_at: '2026-01-01T00:00:00.000Z',
      summary: '进行中',
    })
    assert.equal(task.runId, 'r1')
    assert.equal(task.childSessionId, 'child-xyz')
    assert.equal(task.mode, 'background')
    assert.equal(task.label, '调研甲')
  })

  it('dto 缺 child_session_id / 空白时不写字段', () => {
    const a = dtoToCollaborationTask({
      run_id: 'r2',
      label: '',
      status: 'queued',
      child_session_id: '   ',
    })
    assert.equal(a.childSessionId, undefined)
    assert.equal(a.label, '协作任务')

    const b = dtoToCollaborationTask({
      run_id: 'r3',
      label: 'x',
      status: 'queued',
    })
    assert.equal(b.childSessionId, undefined)
  })

  it('collaborationStatusHint：needs_parent_action 等文案', () => {
    assert.equal(collaborationStatusHint('needs_parent_action'), '需要在主对话处理')
    assert.equal(collaborationStatusHint('queued'), '排队中')
    assert.equal(collaborationStatusHint('running'), '进行中')
    assert.equal(collaborationStatusHint('completed'), '已完成')
    assert.equal(collaborationStatusHint('failed'), '未完成')
    assert.equal(collaborationStatusHint('cancelled'), '已结束')
    assert.equal(collaborationStatusHint('weird'), '进行中')
  })

  it('isActive / isTerminal / shouldShow', () => {
    assert.equal(isActiveCollaborationStatus('needs_parent_action'), true)
    assert.equal(isActiveCollaborationStatus('running'), true)
    assert.equal(isActiveCollaborationStatus('completed'), false)
    assert.equal(isTerminalCollaborationStatus('completed'), true)
    assert.equal(isTerminalCollaborationStatus('needs_parent_action'), false)
    assert.equal(shouldShowCollaborationTask({ runId: 'a', label: 't', status: 'done' }), true)
    assert.equal(
      shouldShowCollaborationTask({ runId: 'a', label: 't', status: 'completed', dismissed: true }),
      false,
    )
  })

  it('applySubagentProgressToTasks：started / progress / done', () => {
    let list = []
    list = applySubagentProgressToTasks(list, {
      type: 'subagent_started',
      run_id: 'run-1',
      label: '并行调研',
      status: 'running',
      child_session_id: 'c-1',
      mode: 'foreground',
    })
    assert.equal(list.length, 1)
    assert.equal(list[0].runId, 'run-1')
    assert.equal(list[0].childSessionId, 'c-1')
    assert.equal(list[0].status, 'running')
    assert.equal(list[0].dismissed, false)

    list = applySubagentProgressToTasks(list, {
      type: 'subagent_progress',
      run_id: 'run-1',
      label: '并行调研',
      status: 'needs_parent_action',
      summary: '需确认',
      child_session_id: 'c-1',
    })
    assert.equal(list.length, 1)
    assert.equal(list[0].status, 'needs_parent_action')
    assert.equal(list[0].summary, '需确认')

    list = applySubagentProgressToTasks(list, {
      type: 'subagent_done',
      run_id: 'run-1',
      label: '并行调研',
      status: 'completed',
      summary: '已完成摘要',
      child_session_id: 'c-1',
      mode: 'foreground',
    })
    assert.equal(list[0].status, 'completed')
    assert.equal(list[0].summary, '已完成摘要')
  })

  it('applySubagentProgressToTasks 忽略无关事件与空 run_id', () => {
    const base = [{ runId: 'x', label: 't', status: 'running' }]
    assert.equal(
      applySubagentProgressToTasks(base, { type: 'thinking', round: 1, label: '想' }),
      base,
    )
    assert.deepEqual(
      applySubagentProgressToTasks(base, {
        type: 'subagent_started',
        run_id: '  ',
        label: 'x',
        status: 'running',
      }),
      base,
    )
  })

  it('dismissCollaborationTask 隐藏终态条；upsert 保留 dismissed', () => {
    let list = [
      { runId: 'r1', label: 'A', status: 'completed' },
      { runId: 'r2', label: 'B', status: 'running' },
    ]
    list = dismissCollaborationTask(list, 'r1')
    assert.equal(list[0].dismissed, true)
    assert.equal(list[1].dismissed, undefined)

    list = upsertCollaborationTask(list, {
      runId: 'r1',
      label: 'A',
      status: 'completed',
      summary: '更新',
    })
    assert.equal(list[0].dismissed, true)
    assert.equal(list[0].summary, '更新')
  })

  it('mergeCollaborationTasksFromApi 保留 dismiss 与本地进行中项', () => {
    const prev = [
      { runId: 'done', label: '旧', status: 'completed', dismissed: true },
      { runId: 'local-only', label: 'SSE', status: 'running', childSessionId: 'c-local' },
    ]
    const merged = mergeCollaborationTasksFromApi(prev, [
      {
        run_id: 'done',
        label: '旧',
        status: 'completed',
        child_session_id: 'c-done',
      },
    ])
    const done = merged.find((t) => t.runId === 'done')
    assert.ok(done)
    assert.equal(done.dismissed, true)
    assert.equal(done.childSessionId, 'c-done')
    const local = merged.find((t) => t.runId === 'local-only')
    assert.ok(local)
    assert.equal(local.childSessionId, 'c-local')
  })
})
