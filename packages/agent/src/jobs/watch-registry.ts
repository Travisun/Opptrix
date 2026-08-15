import { randomUUID } from 'node:crypto'
import {
  JOB_IN_FLIGHT_STATES,
  JOB_WATCH_MAX_PER_SESSION,
  JOB_RESUME_PROMPT_MAX_CHARS,
} from './constants.js'
import { jobRegistry } from './registry.js'
import { sessionResumeBus } from './resume-bus.js'
import { userFacingJobLabel } from './prompt-templates.js'
import type {
  AttachWatchResult,
  BackgroundJobSnapshot,
  JobWatch,
  JobWatchSource,
  WatchRegistry,
} from './types.js'
import type { BackgroundJobKind } from './constants.js'

function dedupeKey(sessionId: string, jobId: string): string {
  return `${sessionId}\0${jobId}`
}

function clampPrompt(prompt: string): string {
  const t = prompt.trim()
  if (t.length <= JOB_RESUME_PROMPT_MAX_CHARS) return t
  return t.slice(0, JOB_RESUME_PROMPT_MAX_CHARS)
}

class WatchRegistryImpl implements WatchRegistry {
  private readonly byWatchId = new Map<string, JobWatch>()
  private readonly byDedupe = new Map<string, string>()
  private readonly bySession = new Map<string, Set<string>>()
  private unsubRegistry: (() => void) | null = null

  constructor() {
    this.bindListeners()
  }

  private bindListeners(): void {
    this.unsubRegistry?.()
    this.unsubRegistry = jobRegistry.subscribe((event) => {
      if (event.type === 'terminal') {
        this.onJobTerminal(event.snapshot)
      }
    })
  }

  attach(input: {
    sessionId: string
    jobId: string
    prompt: string
    reason?: string
    model?: string
    source: JobWatchSource
    allowPromptReplace?: boolean
    kind?: BackgroundJobKind
  }): AttachWatchResult {
    const sessionId = String(input.sessionId ?? '').trim()
    const jobId = String(input.jobId ?? '').trim()
    if (!sessionId) return { ok: false, error: 'session_id 不可用' }
    if (!jobId) return { ok: false, error: 'job_id 必填' }

    const prompt = clampPrompt(input.prompt)
    if (!prompt) return { ok: false, error: 'prompt 必填' }

    const snap = jobRegistry.get(jobId)
    const kind = input.kind
      ?? snap?.kind
      ?? null
    if (!kind) return { ok: false, error: '无法识别任务类型，请稍后重试或显式指定' }

    if (snap && !JOB_IN_FLIGHT_STATES.has(snap.state)) {
      sessionResumeBus.enqueue({
        sessionId,
        cause: 'job_terminal',
        prompt,
        jobId,
        model: input.model,
        snapshot: snap,
      })
      const synthetic: JobWatch = {
        watchId: randomUUID(),
        sessionId,
        jobId,
        kind,
        prompt,
        reason: input.reason,
        model: input.model,
        source: input.source,
        createdAt: new Date().toISOString(),
      }
      return { ok: true, watch: synthetic, deduped: false, promptUpdated: false }
    }

    const key = dedupeKey(sessionId, jobId)
    const existingId = this.byDedupe.get(key)
    if (existingId) {
      const existing = this.byWatchId.get(existingId)
      if (existing) {
        const allowReplace = input.allowPromptReplace === true || input.source === 'explicit'
        if (!allowReplace) {
          return {
            ok: true,
            watch: { ...existing },
            deduped: true,
            promptUpdated: false,
          }
        }
        const updated: JobWatch = {
          ...existing,
          prompt,
          reason: input.reason ?? existing.reason,
          model: input.model ?? existing.model,
          source: input.source,
        }
        this.byWatchId.set(existing.watchId, updated)
        return {
          ok: true,
          watch: { ...updated },
          deduped: true,
          promptUpdated: true,
        }
      }
    }

    const sessionSet = this.sessionSet(sessionId)
    if (sessionSet.size >= JOB_WATCH_MAX_PER_SESSION) {
      return { ok: false, error: `本会话后台等待已达上限（${JOB_WATCH_MAX_PER_SESSION}）` }
    }

    const now = Date.now()
    const watch: JobWatch = {
      watchId: randomUUID(),
      sessionId,
      jobId,
      kind,
      prompt,
      reason: input.reason,
      model: input.model,
      source: input.source,
      createdAt: new Date(now).toISOString(),
    }
    this.byWatchId.set(watch.watchId, watch)
    this.byDedupe.set(key, watch.watchId)
    sessionSet.add(watch.watchId)
    return { ok: true, watch: { ...watch }, deduped: false, promptUpdated: false }
  }

  detach(watchId: string): boolean {
    const id = String(watchId ?? '').trim()
    const watch = this.byWatchId.get(id)
    if (!watch) return false
    this.removeWatch(watch)
    return true
  }

  clearSession(sessionId: string): number {
    const sid = String(sessionId ?? '').trim()
    const set = this.bySession.get(sid)
    if (!set || set.size === 0) return 0
    const ids = [...set]
    for (const id of ids) {
      const w = this.byWatchId.get(id)
      if (w) this.removeWatch(w)
    }
    return ids.length
  }

  clearByJob(sessionId: string, jobId: string): number {
    const sid = String(sessionId ?? '').trim()
    const jid = String(jobId ?? '').trim()
    const key = dedupeKey(sid, jid)
    const watchId = this.byDedupe.get(key)
    if (!watchId) return 0
    const w = this.byWatchId.get(watchId)
    if (!w) return 0
    this.removeWatch(w)
    return 1
  }

  listSession(sessionId: string): JobWatch[] {
    const sid = String(sessionId ?? '').trim()
    const set = this.bySession.get(sid)
    if (!set) return []
    const out: JobWatch[] = []
    for (const id of set) {
      const w = this.byWatchId.get(id)
      if (w) out.push({ ...w })
    }
    return out.sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )
  }

  listSessionsForJob(jobId: string): string[] {
    const jid = String(jobId ?? '').trim()
    if (!jid) return []
    const sessions = new Set<string>()
    for (const watch of this.byWatchId.values()) {
      if (watch.jobId === jid) sessions.add(watch.sessionId)
    }
    return [...sessions]
  }

  onJobTerminal(snapshot: BackgroundJobSnapshot): void {
    const jobId = snapshot.jobId
    const toResume: JobWatch[] = []
    for (const watch of this.byWatchId.values()) {
      if (watch.jobId === jobId) toResume.push({ ...watch })
    }
    if (toResume.length === 0) return
    // 延迟拆除：同一次 emit('terminal') 内让 server 的 jobRegistry.subscribe
    // 仍能 listSessionsForJob 推送终态 job_progress（Composer 条消除依赖此事件）
    queueMicrotask(() => {
      for (const watch of toResume) {
        const current = this.byWatchId.get(watch.watchId)
        if (!current || current.jobId !== jobId) continue
        this.removeWatch(current)
        sessionResumeBus.enqueue({
          sessionId: current.sessionId,
          cause: 'job_terminal',
          prompt: current.prompt,
          jobId: current.jobId,
          watchId: current.watchId,
          model: current.model,
          snapshot,
        })
      }
    })
  }

  resetForTests(): void {
    for (const watch of [...this.byWatchId.values()]) {
      this.removeWatch(watch)
    }
    this.byWatchId.clear()
    this.byDedupe.clear()
    this.bySession.clear()
    this.bindListeners()
  }

  private sessionSet(sessionId: string): Set<string> {
    let s = this.bySession.get(sessionId)
    if (!s) {
      s = new Set()
      this.bySession.set(sessionId, s)
    }
    return s
  }

  private removeWatch(watch: JobWatch): void {
    this.byWatchId.delete(watch.watchId)
    this.byDedupe.delete(dedupeKey(watch.sessionId, watch.jobId))
    const set = this.bySession.get(watch.sessionId)
    if (set) {
      set.delete(watch.watchId)
      if (set.size === 0) this.bySession.delete(watch.sessionId)
    }
  }
}

export const watchRegistry: WatchRegistry = new WatchRegistryImpl()

export function getWatchRegistry(): WatchRegistry {
  return watchRegistry
}

export function listPendingJobWatches(sessionId: string): Array<{
  watch_id: string
  job_id: string
  kind: BackgroundJobKind
  source: JobWatchSource
  label: string
  percent?: number
  eta_seconds?: number | null
  state?: string
}> {
  return watchRegistry.listSession(sessionId).map((w) => {
    const snap = jobRegistry.get(w.jobId)
    return {
      watch_id: w.watchId,
      job_id: w.jobId,
      kind: w.kind,
      source: w.source,
      label: userFacingJobLabel(w.kind, snap?.progress.message),
      percent: snap?.progress.percent,
      eta_seconds: snap?.progress.etaSeconds ?? undefined,
      state: snap?.state,
    }
  })
}
