import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  jobRegistry,
  sessionResumeBus,
  watchRegistry,
  maybeAutoWatchFromToolResult,
  resetJobsSubsystemForTests,
  clearSessionJobWaitsAndWatches,
  isJobWatchEnabled,
  resetTurnWakeForTests,
  configureTurnWakeRuntime,
  scheduleTurnWake,
  listTurnWakeIdsForTests,
} from '@opptrix/agent'

describe('job registry', () => {
  beforeEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })

  it('upsert → progress → terminal emits events', () => {
    const events = []
    const unsub = jobRegistry.subscribe((e) => events.push(e.type))
    const now = Date.now()
    jobRegistry.upsert({
      jobId: 'j1',
      kind: 'python-install',
      state: 'preparing',
      progress: { message: '准备中' },
      cancelable: false,
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: now,
    })
    jobRegistry.update('j1', {
      state: 'running',
      progress: { message: '安装中', percent: 40 },
    })
    jobRegistry.markTerminal('j1', 'completed', {
      progress: { message: '完成', percent: 100 },
    })
    unsub()
    assert.deepEqual(events, ['upsert', 'progress', 'terminal'])
    assert.equal(jobRegistry.get('j1')?.state, 'completed')
  })

  it('requestCancel rejects when not cancelable', async () => {
    const now = Date.now()
    jobRegistry.upsert({
      jobId: 'j2',
      kind: 'fuyao-dump',
      state: 'preparing',
      progress: { message: '下载中' },
      cancelable: false,
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: now,
    })
    const r = await jobRegistry.requestCancel('j2')
    assert.equal(r.ok, false)
    assert.match(r.error ?? '', /不支持取消/)
    assert.equal(jobRegistry.get('j2')?.state, 'preparing')
  })
})

describe('auto-watch dedupe', () => {
  beforeEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
    configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
    })
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })

  it('preparing+job_id attaches once; second call dedupes', () => {
    const emits = []
    const result = {
      ok: true,
      status: 'preparing',
      job_id: 'python-install',
      message: '正在准备运行环境…',
      suggested_wake_seconds: 30,
    }
    const first = maybeAutoWatchFromToolResult({
      sessionId: 's1',
      toolName: 'ensure_python',
      result,
      emit: (e) => emits.push(e.action),
    })
    assert.equal(first.attached, true)
    assert.equal(first.deduped, false)
    const second = maybeAutoWatchFromToolResult({
      sessionId: 's1',
      toolName: 'ensure_python',
      result,
      emit: (e) => emits.push(e.action),
    })
    assert.equal(second.attached, false)
    assert.equal(second.deduped, true)
    assert.deepEqual(emits, ['attached', 'deduped'])
    assert.equal(watchRegistry.listSession('s1').length, 1)
  })
})

describe('cancel matrix: clear waits/watches not global job', () => {
  beforeEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
    configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
    })
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })

  it('clearSessionJobWaitsAndWatches leaves job running', () => {
    const now = Date.now()
    jobRegistry.upsert({
      jobId: 'python-install',
      kind: 'python-install',
      state: 'running',
      progress: { message: '安装中', percent: 20 },
      cancelable: false,
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: now,
    })
    maybeAutoWatchFromToolResult({
      sessionId: 's-clear',
      toolName: 'ensure_python',
      result: {
        status: 'installing',
        job_id: 'python-install',
        suggested_wake_seconds: 20,
      },
    })
    assert.equal(watchRegistry.listSession('s-clear').length, 1)
    assert.equal(listTurnWakeIdsForTests('s-clear').length, 0, 'auto-watch attach is registration only')
    clearSessionJobWaitsAndWatches('s-clear')
    assert.equal(watchRegistry.listSession('s-clear').length, 0)
    assert.equal(jobRegistry.get('python-install')?.state, 'running')
  })
})

describe('resume bus busy defer and single-flight', () => {
  beforeEach(() => {
    resetJobsSubsystemForTests()
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
  })

  it('busy defer then fire once; second enqueue while in-flight is dropped', async () => {
    let calls = 0
    let busy = true
    let releaseHandler
    const gate = new Promise((resolve) => {
      releaseHandler = resolve
    })
    sessionResumeBus.configureRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => busy,
      setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 15)),
      clearTimeout,
    })
    sessionResumeBus.setHandler(async () => {
      calls += 1
      await gate
    })
    const snap = {
      jobId: 'j-busy',
      kind: 'fuyao-dump',
      state: 'completed',
      progress: { message: '已就绪', percent: 100 },
      cancelable: false,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      startedAtMs: Date.now(),
    }
    sessionResumeBus.enqueue({
      sessionId: 's-busy',
      cause: 'job_terminal',
      prompt: '继续',
      jobId: 'j-busy',
      snapshot: snap,
    })
    assert.equal(calls, 0)
    busy = false
    await new Promise((r) => setTimeout(r, 40))
    assert.equal(calls, 1)
    assert.equal(sessionResumeBus.isResumeInFlightForTests('s-busy', 'j-busy'), true)
    sessionResumeBus.enqueue({
      sessionId: 's-busy',
      cause: 'job_terminal',
      prompt: '继续2',
      jobId: 'j-busy',
      snapshot: snap,
    })
    releaseHandler()
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(calls, 1)
  })

  it('busy defer then clearSession does not resume', async () => {
    let calls = 0
    sessionResumeBus.configureRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => true,
      setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)),
      clearTimeout,
    })
    sessionResumeBus.setHandler(async () => {
      calls += 1
    })
    sessionResumeBus.enqueue({
      sessionId: 's-defer-clear',
      cause: 'job_terminal',
      prompt: '继续',
      jobId: 'j-defer-clear',
    })
    assert.equal(calls, 0)
    const cleared = clearSessionJobWaitsAndWatches('s-defer-clear')
    assert.ok(cleared.resumes >= 1)
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(calls, 0)
  })
})

describe('OPPTRIX_JOB_WATCH flag', () => {
  const prev = process.env.OPPTRIX_JOB_WATCH
  afterEach(() => {
    if (prev === undefined) delete process.env.OPPTRIX_JOB_WATCH
    else process.env.OPPTRIX_JOB_WATCH = prev
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })

  it('OPPTRIX_JOB_WATCH=0 disables auto-watch', () => {
    process.env.OPPTRIX_JOB_WATCH = '0'
    assert.equal(isJobWatchEnabled(), false)
    const now = Date.now()
    jobRegistry.upsert({
      jobId: 'python-install',
      kind: 'python-install',
      state: 'running',
      progress: { message: '安装中', percent: 10 },
      cancelable: false,
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: now,
    })
    const r = maybeAutoWatchFromToolResult({
      sessionId: 's-flag-off',
      toolName: 'ensure_python',
      result: {
        status: 'installing',
        job_id: 'python-install',
        suggested_wake_seconds: 20,
      },
    })
    assert.equal(r.attached, false)
    assert.equal(watchRegistry.listSession('s-flag-off').length, 0)
  })
})

describe('watch terminal triggers resume (no soft timer)', () => {
  beforeEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
    configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
    })
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })

  it('markTerminal resumes watched session', async () => {
    let resumed = 0
    sessionResumeBus.configureRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
    })
    sessionResumeBus.setHandler(async () => {
      resumed += 1
    })
    const now = Date.now()
    jobRegistry.upsert({
      jobId: 'dump-1',
      kind: 'fuyao-dump',
      state: 'preparing',
      progress: { message: '下载中' },
      cancelable: false,
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: now,
      suggestedWakeSeconds: 30,
    })
    const att = watchRegistry.attach({
      sessionId: 's-term',
      jobId: 'dump-1',
      prompt: '检查 dump',
      source: 'auto',
      kind: 'fuyao-dump',
    })
    assert.equal(att.ok, true)
    assert.equal(listTurnWakeIdsForTests('s-term').length, 0, 'attach must not schedule soft timer')
    jobRegistry.markTerminal('dump-1', 'completed', {
      progress: { message: '已就绪', percent: 100 },
    })
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(resumed, 1)
    assert.equal(watchRegistry.listSession('s-term').length, 0)
  })

  it('terminal progress subscriber still sees sessions before watch removal', async () => {
    /** 模拟 server：与 WatchRegistry 同 emit 内 listSessionsForJob 须仍可见 */
    const progressSessions = []
    const unsub = jobRegistry.subscribe((event) => {
      if (event.type !== 'terminal') return
      const sessions = watchRegistry.listSessionsForJob(event.snapshot.jobId)
      progressSessions.push(...sessions)
    })
    const now = Date.now()
    jobRegistry.upsert({
      jobId: 'dump-progress',
      kind: 'fuyao-dump',
      state: 'running',
      progress: { message: '下载中', percent: 50 },
      cancelable: false,
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: now,
      suggestedWakeSeconds: 30,
    })
    const att = watchRegistry.attach({
      sessionId: 's-progress-ui',
      jobId: 'dump-progress',
      prompt: '检查 dump',
      source: 'auto',
      kind: 'fuyao-dump',
    })
    assert.equal(att.ok, true)
    assert.deepEqual(watchRegistry.listSessionsForJob('dump-progress'), ['s-progress-ui'])
    jobRegistry.markTerminal('dump-progress', 'completed', {
      progress: { message: '已就绪', percent: 100 },
    })
    // 同步 emit 阶段：server 订阅者必须已拿到 session（Composer 终态条）
    assert.deepEqual(progressSessions, ['s-progress-ui'])
    // microtask 后才拆除 watch
    await new Promise((r) => queueMicrotask(r))
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(watchRegistry.listSession('s-progress-ui').length, 0)
    unsub()
  })
})

describe('schedule_turn_wake rejects job_id', () => {
  beforeEach(() => {
    resetTurnWakeForTests()
    resetJobsSubsystemForTests()
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })

  it('with job_id → ok false', () => {
    configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
    })
    const r = scheduleTurnWake({
      sessionId: 's-no-job',
      prompt: '纯延时',
      seconds: 30,
      jobId: 'dump-x',
    })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.match(r.error, /不接受 job_id/)
  })
})

describe('shell-command job watch', () => {
  beforeEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
    configureTurnWakeRuntime({
      isSessionAlive: () => true,
      isChatBusy: () => false,
    })
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
    resetTurnWakeForTests()
  })

  it('auto-watch attaches for opptrix_run background result', () => {
    const result = {
      ok: true,
      status: 'running',
      job_id: 'shell-abc',
      kind: 'shell-command',
      message: '正在执行命令…',
      suggested_wake_seconds: 60,
    }
    const r = maybeAutoWatchFromToolResult({
      sessionId: 's-shell',
      toolName: 'opptrix_run',
      result,
    })
    assert.equal(r.attached, true)
    assert.equal(r.jobId, 'shell-abc')
    const snap = jobRegistry.get('shell-abc')
    assert.equal(snap?.kind, 'shell-command')
    assert.equal(snap?.cancelable, true)
    assert.equal(snap?.progress.message, '正在执行命令…')
    assert.equal(watchRegistry.listSession('s-shell').length, 1)
  })

  it('shell-command cancelable via requestCancel handler', async () => {
    const {
      cancelShellCommandJob,
      resetShellCommandJobsForTests,
      startShellCommandJob,
      getShellCommandJob,
    } = await import('@opptrix/agent-workspace')
    const { registerDefaultJobAdapters } = await import('@opptrix/agent')
    resetShellCommandJobsForTests()
    resetJobsSubsystemForTests()
    registerDefaultJobAdapters()
    const snap = startShellCommandJob({
      sessionId: 's-cancel',
      commandSummary: 'sleep',
      title: '休眠测试',
      timeoutMs: 60_000,
      run: async (signal) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 60_000)
          signal.addEventListener('abort', () => {
            clearTimeout(t)
            reject(new Error('aborted'))
          }, { once: true })
        })
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    })
    await new Promise((r) => setTimeout(r, 20))
    const fromReg = jobRegistry.get(snap.job_id)
    assert.ok(fromReg)
    assert.equal(fromReg.kind, 'shell-command')
    assert.equal(fromReg.cancelable, true)
    assert.equal(fromReg.title, '休眠测试')
    const cancelled = await jobRegistry.requestCancel(snap.job_id)
    assert.equal(cancelled.ok, true)
    assert.equal(getShellCommandJob(snap.job_id)?.status, 'cancelled')
    assert.equal(cancelShellCommandJob(snap.job_id), false)
    resetShellCommandJobsForTests()
  })
})

describe('shell live stdout_tail + title defaults', () => {
  /** @type {typeof import('@opptrix/agent-workspace').resetShellCommandJobsForTests} */
  let resetShellCommandJobsForTests
  /** @type {typeof import('@opptrix/agent-workspace').startShellCommandJob} */
  let startShellCommandJob
  /** @type {typeof import('@opptrix/agent-workspace').getShellCommandJob} */
  let getShellCommandJob

  beforeEach(async () => {
    resetJobsSubsystemForTests()
    const ws = await import('@opptrix/agent-workspace')
    resetShellCommandJobsForTests = ws.resetShellCommandJobsForTests
    startShellCommandJob = ws.startShellCommandJob
    getShellCommandJob = ws.getShellCommandJob
    resetShellCommandJobsForTests()
  })
  afterEach(() => {
    resetJobsSubsystemForTests()
    resetShellCommandJobsForTests?.()
  })

  it('throttled progress updates stdout_tail while running', async () => {
    const { registerDefaultJobAdapters } = await import('@opptrix/agent')
    resetJobsSubsystemForTests()
    registerDefaultJobAdapters()
    const snap = startShellCommandJob({
      sessionId: 's-tail',
      commandSummary: 'echo-stream',
      timeoutMs: 60_000,
      run: async (_signal, reportOutput) => {
        reportOutput('stdout', 'hello-live-1\n')
        await new Promise((r) => setTimeout(r, 2100))
        reportOutput('stdout', 'hello-live-2\n')
        await new Promise((r) => setTimeout(r, 100))
        return { exitCode: 0, stdout: 'hello-live-1\nhello-live-2\n', stderr: '' }
      },
    })
    // wait past one progress tick
    await new Promise((r) => setTimeout(r, 2300))
    const mid = getShellCommandJob(snap.job_id)
    assert.ok(mid)
    assert.match(mid.stdout_tail ?? '', /hello-live/)
    const fromReg = jobRegistry.get(snap.job_id)
    assert.ok(fromReg)
    assert.match(String(fromReg.meta?.stdout_tail ?? ''), /hello-live/)
    assert.equal(fromReg.title, 'echo-stream')
    // wait for terminal
    await new Promise((r) => setTimeout(r, 500))
  })

  it('listPendingJobWatches exposes title cancelable stdout_tail', async () => {
    const now = Date.now()
    jobRegistry.upsert({
      jobId: 'shell-list-1',
      kind: 'shell-command',
      state: 'running',
      title: 'npm install',
      progress: { message: '正在执行命令…', percent: 20 },
      cancelable: true,
      createdAtMs: now,
      updatedAtMs: now,
      startedAtMs: now,
      meta: { session_id: 's-list', command_summary: 'npm install', stdout_tail: '…downloading' },
    })
    watchRegistry.attach({
      sessionId: 's-list',
      jobId: 'shell-list-1',
      prompt: '检查后台命令',
      source: 'auto',
      kind: 'shell-command',
    })
    const { listPendingJobWatches } = await import('@opptrix/agent')
    const rows = listPendingJobWatches('s-list')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].title, 'npm install')
    assert.equal(rows[0].cancelable, true)
    assert.match(rows[0].stdout_tail ?? '', /downloading/)
  })
})
