import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyJobProgressToBackgroundJobs,
  backgroundJobDisplayTitle,
  hydrateBackgroundJobsFromWatches,
  isReadyLabelTerminal,
  isTerminalBackgroundJobState,
  parseJobProgressEvent,
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

describe('jobWatchProgress title / stdout / cancelable', () => {
  it('parseJobProgressEvent maps title stdout_tail cancelable', () => {
    const parsed = parseJobProgressEvent({
      type: 'job_progress',
      job_id: 'shell-1',
      kind: 'shell-command',
      state: 'running',
      label: '正在执行命令…',
      percent: 40,
      title: '安装依赖',
      stdout_tail: 'npm install\n…',
      cancelable: true,
    })
    assert.ok(parsed)
    assert.equal(parsed.title, '安装依赖')
    assert.equal(parsed.stdoutTail, 'npm install\n…')
    assert.equal(parsed.cancelable, true)
  })

  it('applyJobProgress merges stdout without clearing title', () => {
    const list = [{
      jobId: 'j1',
      label: '正在执行命令…',
      state: 'running',
      title: '下载数据',
      cancelable: true,
      stdoutTail: 'start\n',
    }]
    const next = applyJobProgressToBackgroundJobs(list, {
      jobId: 'j1',
      label: '正在执行命令…',
      state: 'running',
      percent: 55,
      stdoutTail: 'start\nok\n',
    })
    assert.equal(next.length, 1)
    assert.equal(next[0].title, '下载数据')
    assert.equal(next[0].stdoutTail, 'start\nok\n')
    assert.equal(next[0].percent, 55)
    assert.equal(next[0].cancelable, true)
  })

  it('backgroundJobDisplayTitle prefers title', () => {
    assert.equal(
      backgroundJobDisplayTitle({ jobId: '1', label: '正在执行…', state: 'running', title: '编译项目' }),
      '编译项目',
    )
    assert.equal(
      backgroundJobDisplayTitle({ jobId: '1', label: '正在执行…', state: 'running' }),
      '正在执行…',
    )
  })

  it('parsePending hydrates title stdout cancelable', () => {
    const parsed = parsePendingJobWatchesApi({
      job_watches: [{
        watch_id: 'w1',
        job_id: 'j1',
        label: '正在执行命令…',
        state: 'running',
        title: '后台命令',
        stdout_tail: 'hello',
        cancelable: false,
      }],
    })
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].title, '后台命令')
    assert.equal(parsed[0].stdoutTail, 'hello')
    assert.equal(parsed[0].cancelable, false)
  })
})
