/**
 * 后台 shell 命令 Job — 供 JobRegistry Adapter 订阅；墙钟上限 / 可取消 / 每会话并发上限。
 */
import { randomUUID } from 'node:crypto'

export type ShellCommandJobState = 'running' | 'completed' | 'failed' | 'cancelled'

export interface ShellCommandJobSnapshot {
  job_id: string
  session_id: string
  status: ShellCommandJobState
  message: string
  command_summary: string
  /** 可选展示标题（来自工具 title/name）；缺省用 command_summary */
  title?: string
  percent: number
  exit_code: number | null
  stdout_tail: string
  stderr_tail: string
  error: string | null
  started_at_ms: number
  updated_at_ms: number
  eta_seconds: number | null
  suggested_wake_seconds: number | null
}

/** 运行中增量输出回调（节流写入 snapshot 由 progressTimer 负责） */
export type ShellJobOutputReporter = (stream: 'stdout' | 'stderr', chunk: string) => void

export interface ShellCommandJobStartInput {
  sessionId: string
  commandSummary: string
  /** 可选人读标题 */
  title?: string
  /** 墙钟上限 ms */
  timeoutMs: number
  run: (
    signal: AbortSignal,
    reportOutput: ShellJobOutputReporter,
  ) => Promise<{
    exitCode: number | null
    stdout: string
    stderr: string
  }>
}

const JOB_TTL_MS = 2 * 60 * 60 * 1000
/** 每会话同时进行的后台 shell ≤ 2 */
export const SHELL_BG_MAX_IN_FLIGHT_PER_SESSION = 2
/** 默认墙钟 30min */
export const SHELL_BG_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000
export const SHELL_BG_MAX_TIMEOUT_MS = 30 * 60 * 1000
/** 与终态 tail 一致 */
const TAIL_MAX = 4000
/** 运行中累计缓冲上限，避免长输出撑爆内存 */
const LIVE_BUF_MAX = 64_000

const ASYNC_HINT =
  '命令在后台执行。系统通常已自动挂起，结束后同会话通知续跑；'
  + '预计较长（下载/安装/重计算等）必须 background:true；禁止 poll/sleep/反复查进度。'

type Listener = (snap: ShellCommandJobSnapshot) => void

interface JobRecord {
  snap: ShellCommandJobSnapshot
  abort: AbortController
  liveStdout: string
  liveStderr: string
}

const jobs = new Map<string, JobRecord>()
const listeners = new Set<Listener>()

function tail(text: string, max = TAIL_MAX): string {
  if (text.length <= max) return text
  return text.slice(text.length - max)
}

function clipLive(text: string): string {
  if (text.length <= LIVE_BUF_MAX) return text
  return text.slice(text.length - LIVE_BUF_MAX)
}

function pruneJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, rec] of jobs) {
    if (rec.snap.status === 'running') continue
    if (rec.snap.updated_at_ms < cutoff) jobs.delete(id)
  }
}

function notify(snap: ShellCommandJobSnapshot): void {
  for (const listener of [...listeners]) {
    try {
      listener(snap)
    } catch {
      /* ignore */
    }
  }
}

function patchJob(id: string, patch: Partial<ShellCommandJobSnapshot>): ShellCommandJobSnapshot | null {
  const rec = jobs.get(id)
  if (!rec) return null
  rec.snap = {
    ...rec.snap,
    ...patch,
    updated_at_ms: Date.now(),
  }
  notify(rec.snap)
  return rec.snap
}

export function isShellBgEnabled(): boolean {
  const raw = process.env.OPPTRIX_SHELL_BG
  if (raw == null || raw === '') return true
  return raw !== '0' && raw.toLowerCase() !== 'false' && raw.toLowerCase() !== 'off'
}

export function clampShellBgTimeoutMs(timeoutMs?: number): number {
  const raw = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
    ? Math.floor(timeoutMs)
    : SHELL_BG_DEFAULT_TIMEOUT_MS
  return Math.min(SHELL_BG_MAX_TIMEOUT_MS, Math.max(5_000, raw))
}

export function countInFlightShellBgForSession(sessionId: string): number {
  pruneJobs()
  let n = 0
  for (const rec of jobs.values()) {
    if (rec.snap.session_id === sessionId && rec.snap.status === 'running') n++
  }
  return n
}

export function getShellCommandJob(jobId: string): ShellCommandJobSnapshot | null {
  pruneJobs()
  const id = jobId.trim()
  if (!id) return null
  return jobs.get(id)?.snap ?? null
}

export function subscribeShellCommandJob(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function cancelShellCommandJob(jobId: string): boolean {
  const rec = jobs.get(jobId.trim())
  if (!rec) return false
  if (rec.snap.status !== 'running') return false
  rec.abort.abort()
  patchJob(rec.snap.job_id, {
    status: 'cancelled',
    message: '已取消命令',
    error: 'cancelled',
    percent: rec.snap.percent,
    stdout_tail: tail(rec.liveStdout),
    stderr_tail: tail(rec.liveStderr),
  })
  return true
}

export function clearSessionShellCommandJobs(sessionId: string): number {
  let n = 0
  for (const [id, rec] of [...jobs.entries()]) {
    if (rec.snap.session_id !== sessionId) continue
    if (rec.snap.status === 'running') {
      rec.abort.abort()
      patchJob(id, {
        status: 'cancelled',
        message: '会话已结束，命令已取消',
        error: 'session_cleared',
        stdout_tail: tail(rec.liveStdout),
        stderr_tail: tail(rec.liveStderr),
      })
      n++
    }
  }
  return n
}

function estimateEta(startedAt: number, timeoutMs: number): number {
  const elapsed = Date.now() - startedAt
  const remain = Math.max(5, Math.ceil((timeoutMs - elapsed) / 1000))
  return Math.min(1800, remain)
}

/**
 * 启动后台命令：立即返回 running 快照；run() 在后台执行。
 */
export function startShellCommandJob(input: ShellCommandJobStartInput): ShellCommandJobSnapshot {
  pruneJobs()
  const sessionId = input.sessionId.trim()
  if (countInFlightShellBgForSession(sessionId) >= SHELL_BG_MAX_IN_FLIGHT_PER_SESSION) {
    throw new Error(
      `本对话同时进行的后台命令已达上限（${SHELL_BG_MAX_IN_FLIGHT_PER_SESSION}）。请等待完成或 cancel_job 后再试。`,
    )
  }

  const jobId = `shell-${randomUUID()}`
  const now = Date.now()
  const timeoutMs = clampShellBgTimeoutMs(input.timeoutMs)
  const eta = estimateEta(now, timeoutMs)
  const abort = new AbortController()
  const titleRaw = typeof input.title === 'string' ? input.title.trim() : ''
  const commandSummary = input.commandSummary.slice(0, 200)
  const snap: ShellCommandJobSnapshot = {
    job_id: jobId,
    session_id: sessionId,
    status: 'running',
    message: '正在执行命令…',
    command_summary: commandSummary,
    title: titleRaw || undefined,
    percent: 5,
    exit_code: null,
    stdout_tail: '',
    stderr_tail: '',
    error: null,
    started_at_ms: now,
    updated_at_ms: now,
    eta_seconds: eta,
    suggested_wake_seconds: Math.min(1800, Math.max(5, eta)),
  }
  const rec: JobRecord = { snap, abort, liveStdout: '', liveStderr: '' }
  jobs.set(jobId, rec)
  notify(snap)

  const reportOutput: ShellJobOutputReporter = (stream, chunk) => {
    const cur = jobs.get(jobId)
    if (!cur || cur.snap.status !== 'running') return
    if (!chunk) return
    if (stream === 'stdout') cur.liveStdout = clipLive(cur.liveStdout + chunk)
    else cur.liveStderr = clipLive(cur.liveStderr + chunk)
  }

  const progressTimer = setInterval(() => {
    const cur = jobs.get(jobId)
    if (!cur || cur.snap.status !== 'running') {
      clearInterval(progressTimer)
      return
    }
    const nextEta = estimateEta(cur.snap.started_at_ms, timeoutMs)
    const elapsedRatio = Math.min(0.9, (Date.now() - cur.snap.started_at_ms) / timeoutMs)
    patchJob(jobId, {
      percent: Math.max(5, Math.min(90, Math.floor(5 + elapsedRatio * 85))),
      message: '正在执行命令…',
      eta_seconds: nextEta,
      suggested_wake_seconds: Math.min(1800, Math.max(5, nextEta)),
      stdout_tail: tail(cur.liveStdout),
      stderr_tail: tail(cur.liveStderr),
    })
  }, 2_000)
  if (typeof progressTimer === 'object' && progressTimer !== null && 'unref' in progressTimer) {
    progressTimer.unref()
  }

  void (async () => {
    try {
      const result = await input.run(abort.signal, reportOutput)
      clearInterval(progressTimer)
      const cur = jobs.get(jobId)
      if (!cur || cur.snap.status === 'cancelled') return
      // 终态优先用完整结果；若 run 未回填则用 live 缓冲
      const stdout = result.stdout || cur.liveStdout
      const stderr = result.stderr || cur.liveStderr
      cur.liveStdout = stdout
      cur.liveStderr = stderr
      const ok = result.exitCode === 0
      patchJob(jobId, {
        status: ok ? 'completed' : 'failed',
        percent: 100,
        exit_code: result.exitCode,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
        message: ok ? '命令已完成' : `命令未成功（退出码 ${result.exitCode ?? 'unknown'}）`,
        error: ok ? null : (tail(stderr) || `exit ${result.exitCode}`),
        eta_seconds: 0,
        suggested_wake_seconds: null,
      })
    } catch (err) {
      clearInterval(progressTimer)
      const cur = jobs.get(jobId)
      if (!cur || cur.snap.status === 'cancelled') return
      const message = err instanceof Error ? err.message : String(err)
      const aborted = abort.signal.aborted
      patchJob(jobId, {
        status: aborted ? 'cancelled' : 'failed',
        percent: aborted ? cur.snap.percent : 100,
        message: aborted ? '已取消命令' : message,
        error: aborted ? 'cancelled' : message,
        stdout_tail: tail(cur.liveStdout),
        stderr_tail: tail(cur.liveStderr),
        eta_seconds: 0,
        suggested_wake_seconds: null,
      })
    }
  })()

  return snap
}

export function shellCommandJobAsyncHint(): string {
  return ASYNC_HINT
}

export function resetShellCommandJobsForTests(): void {
  for (const rec of jobs.values()) {
    if (rec.snap.status === 'running') rec.abort.abort()
  }
  jobs.clear()
}
