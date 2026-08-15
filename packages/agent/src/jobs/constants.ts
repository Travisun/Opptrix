/** Job 驱动续跑常量 */

export const JOB_WATCH_MAX_PER_SESSION = 8
export const JOB_RESUME_PROMPT_MAX_CHARS = 4000
export const JOB_BUSY_DEFER_SECONDS = 10
/** job_progress 事件节流 */
export const JOB_PROGRESS_THROTTLE_MS = 500
/** Adapter 轮询间隔（仅有 in-flight job 时） */
export const JOB_ADAPTER_POLL_MS = 500
/** 终态快照 TTL（与 fuyao dump 同级） */
export const JOB_SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000

export type BackgroundJobKind =
  | 'python-install'
  | 'fuyao-dump'
  | 'shell-command'

export type BackgroundJobState =
  | 'queued'
  | 'accepted'
  | 'preparing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** 工具层用于自动 watch 的「进行中」态（含 installing→mapped running） */
export const JOB_IN_FLIGHT_STATES: ReadonlySet<BackgroundJobState> = new Set([
  'queued',
  'accepted',
  'preparing',
  'running',
])

export const JOB_TERMINAL_STATES: ReadonlySet<BackgroundJobState> = new Set([
  'completed',
  'failed',
  'cancelled',
])

/** Feature flag：`OPPTRIX_JOB_WATCH=0` 关闭 auto-watch（默认 on） */
export function isJobWatchEnabled(): boolean {
  const raw = process.env.OPPTRIX_JOB_WATCH
  if (raw == null || raw === '') return true
  return raw !== '0' && raw.toLowerCase() !== 'false' && raw.toLowerCase() !== 'off'
}
