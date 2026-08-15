import type {
  BackgroundJobKind,
  BackgroundJobState,
} from './constants.js'

export interface BackgroundJobProgress {
  percent?: number
  phase?: string
  /** 用户向文案（已产品化，无路径/密钥） */
  message: string
  bytesDownloaded?: number
  bytesTotal?: number | null
  etaSeconds?: number | null
}

export interface BackgroundJobSnapshot {
  jobId: string
  kind: BackgroundJobKind
  state: BackgroundJobState
  progress: BackgroundJobProgress
  cancelable: boolean
  createdAtMs: number
  updatedAtMs: number
  startedAtMs: number | null
  error?: string | null
  meta?: Record<string, unknown>
  suggestedWakeSeconds?: number
}

export type JobRegistryEvent =
  | { type: 'upsert'; snapshot: BackgroundJobSnapshot }
  | { type: 'progress'; snapshot: BackgroundJobSnapshot }
  | { type: 'terminal'; snapshot: BackgroundJobSnapshot }

export type JobRegistryListener = (event: JobRegistryEvent) => void

export interface JobRegistry {
  get(jobId: string): BackgroundJobSnapshot | null
  list(filter?: { kind?: BackgroundJobKind; states?: BackgroundJobState[] }): BackgroundJobSnapshot[]
  upsert(snapshot: BackgroundJobSnapshot): void
  update(
    jobId: string,
    patch: Partial<Pick<
      BackgroundJobSnapshot,
      'state' | 'progress' | 'error' | 'meta' | 'suggestedWakeSeconds' | 'cancelable'
    >>,
  ): BackgroundJobSnapshot | null
  markTerminal(
    jobId: string,
    state: 'completed' | 'failed' | 'cancelled',
    patch?: Partial<BackgroundJobSnapshot>,
  ): BackgroundJobSnapshot | null
  subscribe(listener: JobRegistryListener): () => void
  requestCancel(jobId: string): Promise<{ ok: boolean; error?: string }>
  setCancelHandler(
    kind: BackgroundJobKind,
    handler: ((jobId: string) => Promise<boolean>) | null,
  ): void
  resetForTests(): void
}

export type JobWatchSource = 'auto' | 'explicit'

export interface JobWatch {
  watchId: string
  sessionId: string
  jobId: string
  kind: BackgroundJobKind
  prompt: string
  reason?: string
  model?: string
  source: JobWatchSource
  createdAt: string
}

export type AttachWatchResult =
  | {
    ok: true
    watch: JobWatch
    deduped: boolean
    promptUpdated: boolean
  }
  | { ok: false; error: string }

export interface WatchRegistry {
  attach(input: {
    sessionId: string
    jobId: string
    prompt: string
    reason?: string
    model?: string
    source: JobWatchSource
    allowPromptReplace?: boolean
    kind?: BackgroundJobKind
  }): AttachWatchResult
  detach(watchId: string): boolean
  clearSession(sessionId: string): number
  clearByJob(sessionId: string, jobId: string): number
  listSession(sessionId: string): JobWatch[]
  /** 哪些会话在 watch 该 job */
  listSessionsForJob(jobId: string): string[]
  onJobTerminal(snapshot: BackgroundJobSnapshot): void
  resetForTests(): void
}

export type ResumeCause = 'job_terminal' | 'manual'

export interface ResumeRequest {
  sessionId: string
  cause: ResumeCause
  prompt: string
  jobId?: string
  watchId?: string
  wakeId?: string
  model?: string
  snapshot?: BackgroundJobSnapshot
}

export type SessionResumeHandler = (req: ResumeRequest, wakeMessage: string) => Promise<void>

export interface SessionResumeBus {
  setHandler(handler: SessionResumeHandler | null): void
  configureRuntime(rt: {
    isSessionAlive: (sessionId: string) => boolean
    isChatBusy: (sessionId: string) => boolean
    now?: () => number
    setTimeout?: typeof setTimeout
    clearTimeout?: typeof clearTimeout
  } | null): void
  enqueue(req: ResumeRequest): void
  formatMessage(req: ResumeRequest): string
  /** Stop/新消息/删会话：取消该会话 busy-defer 与 in-flight 单飞锁 */
  clearSession(sessionId: string): number
  /** 测试：进行中 resume 锁 */
  isResumeInFlightForTests(sessionId: string, jobId?: string): boolean
  resetForTests(): void
}

/** 工具返回体约定（自动 watch 识别） */
export interface AsyncJobToolResult {
  ok?: boolean
  status?: string
  job_id?: string
  kind?: string
  eta_seconds?: number
  suggested_wake_seconds?: number
  resume_prompt?: string
  message?: string
}

export type JobWatchProgressEmitter = (event: {
  type: 'job_watch'
  action: 'attached' | 'deduped' | 'updated' | 'cleared' | 'resuming'
  watch_id: string
  job_id: string
  kind: BackgroundJobKind
  label: string
  percent?: number
  eta_seconds?: number
  source: JobWatchSource
} | {
  type: 'job_progress'
  job_id: string
  kind: BackgroundJobKind
  state: BackgroundJobState
  label: string
  percent?: number
}) => void
