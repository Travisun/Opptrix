import {
  isJobWatchEnabled,
  JOB_IN_FLIGHT_STATES,
  type BackgroundJobKind,
  type BackgroundJobState,
} from './constants.js'
import { jobRegistry } from './registry.js'
import {
  buildDefaultResumePrompt,
  resolveJobKindFromJobId,
  resolveJobKindFromTool,
  userFacingJobLabel,
} from './prompt-templates.js'
import { watchRegistry } from './watch-registry.js'
import type {
  AsyncJobToolResult,
  JobWatchProgressEmitter,
} from './types.js'

const AUTO_WATCH_STATUSES = new Set([
  'queued',
  'accepted',
  'preparing',
  'installing',
  'running',
])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function isAutoWatchEligible(result: unknown): result is AsyncJobToolResult {
  if (!isRecord(result)) return false
  const jobId = typeof result.job_id === 'string' ? result.job_id.trim() : ''
  if (!jobId) return false
  const status = typeof result.status === 'string' ? result.status.trim().toLowerCase() : ''
  if (!status) return false
  // installing 映射为进行中
  if (status === 'installing') return true
  return AUTO_WATCH_STATUSES.has(status)
}

function mapToolStatusToState(status: string): BackgroundJobState | null {
  const s = status.trim().toLowerCase()
  if (s === 'queued') return 'queued'
  if (s === 'accepted') return 'accepted'
  if (s === 'preparing') return 'preparing'
  if (s === 'installing' || s === 'running') return 'running'
  if (s === 'ready' || s === 'completed') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'cancelled') return 'cancelled'
  return null
}

function ensureRegistrySnapshot(
  jobId: string,
  kind: BackgroundJobKind,
  result: AsyncJobToolResult,
): void {
  const existing = jobRegistry.get(jobId)
  const state = mapToolStatusToState(result.status ?? '') ?? 'preparing'
  if (!JOB_IN_FLIGHT_STATES.has(state)) return

  const eta =
    typeof result.eta_seconds === 'number' && Number.isFinite(result.eta_seconds)
      ? Math.max(0, Math.floor(result.eta_seconds))
      : null
  const suggested =
    typeof result.suggested_wake_seconds === 'number'
      && Number.isFinite(result.suggested_wake_seconds)
      ? Math.floor(result.suggested_wake_seconds)
      : undefined
  const message =
    typeof result.message === 'string' && result.message.trim()
      ? result.message.trim()
      : userFacingJobLabel(kind)

  if (existing) {
    if (JOB_IN_FLIGHT_STATES.has(existing.state)) {
      jobRegistry.update(jobId, {
        state,
        progress: {
          ...existing.progress,
          message,
          etaSeconds: eta,
        },
        suggestedWakeSeconds: suggested ?? existing.suggestedWakeSeconds,
      })
    }
    return
  }

  const now = Date.now()
  jobRegistry.upsert({
    jobId,
    kind,
    state,
    progress: {
      message,
      etaSeconds: eta,
    },
    cancelable: kind === 'shell-command',
    createdAtMs: now,
    updatedAtMs: now,
    startedAtMs: now,
    suggestedWakeSeconds: suggested,
  })
}

export function maybeAutoWatchFromToolResult(opts: {
  sessionId: string
  toolName: string
  result: unknown
  model?: string
  emit?: JobWatchProgressEmitter
}): {
  attached: boolean
  deduped: boolean
  watchId?: string
  jobId?: string
} {
  if (!isJobWatchEnabled()) {
    return { attached: false, deduped: false }
  }
  if (!isAutoWatchEligible(opts.result)) {
    return { attached: false, deduped: false }
  }

  const result = opts.result
  const jobId = String(result.job_id).trim()
  const kindFromResult =
    typeof result.kind === 'string' && result.kind.trim()
      ? (result.kind.trim() as BackgroundJobKind)
      : null
  const kind =
    (kindFromResult === 'python-install'
      || kindFromResult === 'fuyao-dump'
      || kindFromResult === 'shell-command'
      ? kindFromResult
      : null)
    ?? resolveJobKindFromTool(opts.toolName)
    ?? resolveJobKindFromJobId(jobId)
    ?? jobRegistry.get(jobId)?.kind
    ?? null

  if (!kind) {
    // 未知 kind：仍尝试用通用模板挂 watch（需 kind）；跳过
    return { attached: false, deduped: false }
  }

  ensureRegistrySnapshot(jobId, kind, result)

  const resumePrompt =
    typeof result.resume_prompt === 'string' && result.resume_prompt.trim()
      ? result.resume_prompt.trim()
      : buildDefaultResumePrompt(kind, jobId)

  const attach = watchRegistry.attach({
    sessionId: opts.sessionId,
    jobId,
    prompt: resumePrompt,
    reason: `auto_watch:${opts.toolName}`,
    model: opts.model,
    source: 'auto',
    allowPromptReplace: false,
    kind,
  })

  if (!attach.ok) {
    return { attached: false, deduped: false, jobId }
  }

  const snap = jobRegistry.get(jobId)
  const label = userFacingJobLabel(kind, snap?.progress.message)

  if (attach.deduped) {
    // 不去第二次刷 attached；可选静默
    opts.emit?.({
      type: 'job_watch',
      action: 'deduped',
      watch_id: attach.watch.watchId,
      job_id: jobId,
      kind,
      label,
      percent: snap?.progress.percent,
      eta_seconds: snap?.progress.etaSeconds ?? undefined,
      source: 'auto',
    })
    return {
      attached: false,
      deduped: true,
      watchId: attach.watch.watchId,
      jobId,
    }
  }

  opts.emit?.({
    type: 'job_watch',
    action: 'attached',
    watch_id: attach.watch.watchId,
    job_id: jobId,
    kind,
    label,
    percent: snap?.progress.percent,
    eta_seconds: snap?.progress.etaSeconds ?? undefined,
    source: 'auto',
  })

  return {
    attached: true,
    deduped: false,
    watchId: attach.watch.watchId,
    jobId,
  }
}
