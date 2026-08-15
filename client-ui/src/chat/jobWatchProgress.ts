/**
 * Job watch / progress：解析过程条文案（用户向，无技术词）。
 */

export type JobWatchUiInfo = {
  watchId: string
  jobId: string
  kind: string
  label: string
  percent?: number
  etaSeconds?: number
  source: string
  title?: string
  stdoutTail?: string
  cancelable?: boolean
}

/** Composer 上方状态条：本会话未完成的后台任务 */
export type SessionBackgroundJob = {
  jobId: string
  label: string
  percent?: number
  state: string
  kind?: string
  /** 人读标题（优先于 label 展示） */
  title?: string
  /** 持续输出尾部（等宽区） */
  stdoutTail?: string
  /** false 时禁用「结束任务」并说明 */
  cancelable?: boolean
}

/** 终态：条应立即消失（含 ready 等上游别名） */
const JOB_TERMINAL_UI = new Set([
  'completed',
  'failed',
  'cancelled',
  'ready',
  'done',
  'success',
  'succeeded',
])

export function isTerminalBackgroundJobState(state: string | undefined): boolean {
  if (typeof state !== 'string') return false
  const s = state.trim().toLowerCase()
  return s.length > 0 && JOB_TERMINAL_UI.has(s)
}

/** label 启发式：已就绪且非失败 → 视为终态（Composer 上方仅进行中） */
export function isReadyLabelTerminal(
  label: string | undefined,
  state?: string,
): boolean {
  const st = typeof state === 'string' ? state.trim().toLowerCase() : ''
  if (st === 'failed' || st === 'cancelled') return false
  const text = typeof label === 'string' ? label.trim() : ''
  if (!text) return false
  return text === '已就绪' || text.startsWith('已就绪')
}

/** 是否应在 Composer 上方展示（仅进行中） */
export function shouldShowBackgroundJob(job: {
  label: string
  state?: string
}): boolean {
  if (isTerminalBackgroundJobState(job.state)) return false
  if (isReadyLabelTerminal(job.label, job.state)) return false
  return true
}

export function jobWatchToBackgroundJob(info: JobWatchUiInfo, state = 'running'): SessionBackgroundJob {
  return {
    jobId: info.jobId,
    label: info.label,
    percent: info.percent,
    state,
    kind: info.kind || undefined,
    title: info.title,
    stdoutTail: info.stdoutTail,
    cancelable: info.cancelable,
  }
}

export function upsertSessionBackgroundJob(
  list: SessionBackgroundJob[],
  job: SessionBackgroundJob,
): SessionBackgroundJob[] {
  if (!shouldShowBackgroundJob(job)) {
    return list.filter((j) => j.jobId !== job.jobId)
  }
  const idx = list.findIndex((j) => j.jobId === job.jobId)
  if (idx < 0) return [...list, job]
  const prev = list[idx]
  const next = list.slice()
  const merged: SessionBackgroundJob = {
    ...prev,
    jobId: job.jobId,
    label: job.label,
    state: job.state,
  }
  if (job.percent !== undefined) merged.percent = job.percent
  if (job.kind !== undefined) merged.kind = job.kind
  if (job.title !== undefined) merged.title = job.title
  if (job.stdoutTail !== undefined) merged.stdoutTail = job.stdoutTail
  if (job.cancelable !== undefined) merged.cancelable = job.cancelable
  next[idx] = merged
  return next
}

export function removeSessionBackgroundJob(
  list: SessionBackgroundJob[],
  jobId: string,
): SessionBackgroundJob[] {
  const id = jobId.trim()
  if (!id) return list
  return list.filter((j) => j.jobId !== id)
}

export type JobProgressUiPatch = {
  jobId: string
  label: string
  percent?: number
  state?: string
  kind?: string
  title?: string
  stdoutTail?: string
  cancelable?: boolean
}

export function applyJobProgressToBackgroundJobs(
  list: SessionBackgroundJob[],
  progress: JobProgressUiPatch,
): SessionBackgroundJob[] {
  if (
    isTerminalBackgroundJobState(progress.state)
    || isReadyLabelTerminal(progress.label, progress.state)
  ) {
    return removeSessionBackgroundJob(list, progress.jobId)
  }
  return upsertSessionBackgroundJob(list, {
    jobId: progress.jobId,
    label: progress.label,
    percent: progress.percent,
    state: progress.state?.trim() || 'running',
    kind: progress.kind,
    title: progress.title,
    stdoutTail: progress.stdoutTail,
    cancelable: progress.cancelable,
  })
}

export function hydrateBackgroundJobsFromWatches(watches: JobWatchUiInfo[]): SessionBackgroundJob[] {
  const out: SessionBackgroundJob[] = []
  for (const w of watches) {
    const job = jobWatchToBackgroundJob(w)
    if (!shouldShowBackgroundJob(job)) continue
    out.push(job)
  }
  return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function formatJobProgressLabel(info: {
  label: string
  percent?: number
  etaSeconds?: number
}): string {
  const base = info.label.trim() || '后台任务进行中'
  const pct =
    typeof info.percent === 'number' && Number.isFinite(info.percent)
      ? Math.max(0, Math.min(100, Math.floor(info.percent)))
      : null
  if (pct != null && pct > 0 && pct < 100) {
    return `${base}（${pct}%）`
  }
  if (
    typeof info.etaSeconds === 'number'
    && Number.isFinite(info.etaSeconds)
    && info.etaSeconds > 0
  ) {
    const s = Math.floor(info.etaSeconds)
    if (s < 60) return `${base}（约 ${s} 秒）`
    const m = Math.floor(s / 60)
    return `${base}（约 ${m} 分）`
  }
  return base
}

/** 列表主标题：优先 title */
export function backgroundJobDisplayTitle(job: SessionBackgroundJob): string {
  const title = typeof job.title === 'string' ? job.title.trim() : ''
  if (title) return title
  const label = typeof job.label === 'string' ? job.label.trim() : ''
  return label || '进行中的任务'
}

export function parseJobWatchEvent(event: {
  type: string
  action?: string
  watch_id?: string
  job_id?: string
  kind?: string
  label?: string
  percent?: number
  eta_seconds?: number
  source?: string
  title?: string
  stdout_tail?: string
  cancelable?: boolean
}): JobWatchUiInfo | null {
  if (event.type !== 'job_watch') return null
  if (event.action !== 'attached' && event.action !== 'updated') return null
  const watchId = typeof event.watch_id === 'string' ? event.watch_id.trim() : ''
  const jobId = typeof event.job_id === 'string' ? event.job_id.trim() : ''
  if (!watchId || !jobId) return null
  return {
    watchId,
    jobId,
    kind: typeof event.kind === 'string' ? event.kind : '',
    label: typeof event.label === 'string' && event.label.trim()
      ? event.label.trim()
      : '后台任务进行中',
    percent: typeof event.percent === 'number' ? event.percent : undefined,
    etaSeconds: typeof event.eta_seconds === 'number' ? event.eta_seconds : undefined,
    source: typeof event.source === 'string' ? event.source : 'auto',
    title: typeof event.title === 'string' && event.title.trim() ? event.title.trim() : undefined,
    stdoutTail: typeof event.stdout_tail === 'string' ? event.stdout_tail : undefined,
    cancelable: typeof event.cancelable === 'boolean' ? event.cancelable : undefined,
  }
}

export function parseJobProgressEvent(event: {
  type: string
  job_id?: string
  kind?: string
  state?: string
  label?: string
  percent?: number
  title?: string
  stdout_tail?: string
  cancelable?: boolean
}): JobProgressUiPatch | null {
  if (event.type !== 'job_progress') return null
  const jobId = typeof event.job_id === 'string' ? event.job_id.trim() : ''
  if (!jobId) return null
  return {
    jobId,
    label: typeof event.label === 'string' && event.label.trim()
      ? event.label.trim()
      : '后台任务进行中',
    percent: typeof event.percent === 'number' ? event.percent : undefined,
    state: typeof event.state === 'string' ? event.state : undefined,
    kind: typeof event.kind === 'string' ? event.kind : undefined,
    title: typeof event.title === 'string' && event.title.trim() ? event.title.trim() : undefined,
    stdoutTail: typeof event.stdout_tail === 'string' ? event.stdout_tail : undefined,
    cancelable: typeof event.cancelable === 'boolean' ? event.cancelable : undefined,
  }
}

/** 解析 pending-wakes / pending-job-watches 中的 job_watches */
export function parsePendingJobWatchesApi(payload: unknown): JobWatchUiInfo[] {
  if (!isRecord(payload)) return []
  const raw = Array.isArray(payload.job_watches)
    ? payload.job_watches
    : Array.isArray(payload.watches)
      ? payload.watches
      : []
  const out: JobWatchUiInfo[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const watchId = typeof item.watch_id === 'string' ? item.watch_id.trim() : ''
    const jobId = typeof item.job_id === 'string' ? item.job_id.trim() : ''
    if (!watchId || !jobId) continue
    const state = typeof item.state === 'string' ? item.state : undefined
    const label = typeof item.label === 'string' && item.label.trim()
      ? item.label.trim()
      : '后台任务进行中'
    if (isTerminalBackgroundJobState(state) || isReadyLabelTerminal(label, state)) continue
    out.push({
      watchId,
      jobId,
      kind: typeof item.kind === 'string' ? item.kind : '',
      label,
      percent: typeof item.percent === 'number' ? item.percent : undefined,
      etaSeconds: typeof item.eta_seconds === 'number'
        ? item.eta_seconds
        : typeof item.seconds_left === 'number'
          ? item.seconds_left
          : undefined,
      source: typeof item.source === 'string' ? item.source : 'auto',
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : undefined,
      stdoutTail: typeof item.stdout_tail === 'string'
        ? item.stdout_tail
        : typeof item.stdoutTail === 'string'
          ? item.stdoutTail
          : undefined,
      cancelable: typeof item.cancelable === 'boolean' ? item.cancelable : undefined,
    })
  }
  return out
}
