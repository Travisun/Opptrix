import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyJobProgressToBackgroundJobs,
  hydrateBackgroundJobsFromWatches,
  isReadyLabelTerminal,
  isTerminalBackgroundJobState,
  parsePendingJobWatchesApi,
  shouldShowBackgroundJob,
  upsertSessionBackgroundJob,
} from '../client-ui/src/chat/jobWatchProgress.ts'

describe('jobWatchProgress terminal / ready', () => {
  it('treats ready and aliases as terminal', () => {
    assert.equal(isTerminalBackgroundJobState('ready'), true)
    assert.equal(isTerminalBackgroundJobState('READY'), true)
    assert.equal(isTerminalBackgroundJobState('completed'), true)
    assert.equal(isTerminalBackgroundJobState('done'), true)
    assert.equal(isTerminalBackgroundJobState('running'), false)
  })

  it('removes on state=ready via applyJobProgress', () => {
    const list = [{ jobId: 'j1', label: '正在准备数据包…', state: 'running' }]
    const next = applyJobProgressToBackgroundJobs(list, {
      jobId: 'j1',
      label: '已就绪',
      state: 'ready',
    })
    assert.deepEqual(next, [])
  })

  it('removes when label is 已就绪 even if state still running', () => {
    const list = [{ jobId: 'j1', label: '正在准备…', state: 'running' }]
    const next = applyJobProgressToBackgroundJobs(list, {
      jobId: 'j1',
      label: '已就绪',
      state: 'running',
    })
    assert.deepEqual(next, [])
    assert.equal(isReadyLabelTerminal('已就绪', 'running'), true)
    assert.equal(isReadyLabelTerminal('已就绪', 'failed'), false)
  })

  it('upsert removes terminal / ready-label jobs', () => {
    const base = [{ jobId: 'a', label: '正在执行命令…', state: 'running' }]
    assert.deepEqual(
      upsertSessionBackgroundJob(base, { jobId: 'a', label: '已就绪', state: 'completed' }),
      [],
    )
    assert.deepEqual(
      upsertSessionBackgroundJob(base, { jobId: 'a', label: '已就绪', state: 'running' }),
      [],
    )
  })

  it('hydrate and parsePending skip ready / terminal', () => {
    const watches = [
      { watchId: 'w1', jobId: 'j1', kind: 'fuyao-dump', label: '已就绪', source: 'auto' },
      { watchId: 'w2', jobId: 'j2', kind: 'shell-command', label: '正在执行命令…', source: 'auto' },
    ]
    const hydrated = hydrateBackgroundJobsFromWatches(watches)
    assert.equal(hydrated.length, 1)
    assert.equal(hydrated[0].jobId, 'j2')

    const parsed = parsePendingJobWatchesApi({
      job_watches: [
        { watch_id: 'w1', job_id: 'j1', label: '已就绪', state: 'ready' },
        { watch_id: 'w2', job_id: 'j2', label: '正在执行命令…', state: 'running' },
        { watch_id: 'w3', job_id: 'j3', label: '失败', state: 'failed' },
      ],
    })
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].jobId, 'j2')
  })

  it('shouldShowBackgroundJob filters for composer bar', () => {
    assert.equal(shouldShowBackgroundJob({ label: '正在准备…', state: 'running' }), true)
    assert.equal(shouldShowBackgroundJob({ label: '已就绪', state: 'running' }), false)
    assert.equal(shouldShowBackgroundJob({ label: '正在准备…', state: 'ready' }), false)
    assert.equal(shouldShowBackgroundJob({ label: '失败', state: 'failed' }), false)
  })
})
