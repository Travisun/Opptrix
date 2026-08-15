import {
  JOB_BUSY_DEFER_SECONDS,
  JOB_RESUME_PROMPT_MAX_CHARS,
} from './constants.js'
import type {
  ResumeRequest,
  SessionResumeBus,
  SessionResumeHandler,
} from './types.js'

type ResumeRuntime = {
  isSessionAlive: (sessionId: string) => boolean
  isChatBusy: (sessionId: string) => boolean
  now?: () => number
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

function resumeKey(sessionId: string, jobId?: string): string {
  return `${sessionId}\0${jobId?.trim() || '_'}`
}

function clampPrompt(prompt: string): string {
  const t = prompt.trim()
  if (t.length <= JOB_RESUME_PROMPT_MAX_CHARS) return t
  return t.slice(0, JOB_RESUME_PROMPT_MAX_CHARS)
}

export function formatJobResumeMessage(req: ResumeRequest, firedAtIso?: string): string {
  const causeLabel =
    req.cause === 'job_terminal'
      ? '后台任务已结束'
      : '手动续跑'

  const lines = [
    `系统续跑：${causeLabel}，请按下列说明继续（接上原计划；勿 poll / sleep / 反复查进度）。`,
    '',
    clampPrompt(req.prompt),
    '',
    '---',
    `resume_cause: ${req.cause}`,
  ]
  if (req.watchId) lines.push(`watch_id: ${req.watchId}`)
  if (req.wakeId) lines.push(`wake_id: ${req.wakeId}`)
  if (req.jobId?.trim()) lines.push(`job_id: ${req.jobId.trim()}`)
  if (req.snapshot) {
    lines.push(`job_state: ${req.snapshot.state}`)
    if (req.snapshot.progress.message) {
      lines.push(`job_message: ${req.snapshot.progress.message}`)
    }
    if (req.snapshot.error) lines.push(`job_error: ${req.snapshot.error}`)
  }
  if (firedAtIso) lines.push(`fired_at: ${firedAtIso}`)
  return lines.join('\n')
}

class SessionResumeBusImpl implements SessionResumeBus {
  private handler: SessionResumeHandler | null = null
  private runtime: ResumeRuntime | null = null
  /** session×job 单飞：防止同终态重复 resume */
  private readonly inFlight = new Set<string>()
  private readonly deferTimers = new Map<string, ReturnType<typeof setTimeout>>()

  setHandler(handler: SessionResumeHandler | null): void {
    this.handler = handler
  }

  configureRuntime(rt: ResumeRuntime | null): void {
    this.runtime = rt
  }

  formatMessage(req: ResumeRequest): string {
    const now = this.runtime?.now?.() ?? Date.now()
    return formatJobResumeMessage(req, new Date(now).toISOString())
  }

  enqueue(req: ResumeRequest): void {
    const sessionId = String(req.sessionId ?? '').trim()
    if (!sessionId) return
    const key = resumeKey(sessionId, req.jobId)

    if (this.inFlight.has(key)) return

    const alive = this.runtime?.isSessionAlive(sessionId) ?? true
    if (!alive) return

    if (this.runtime?.isChatBusy(sessionId)) {
      this.scheduleBusyDefer(req, key)
      return
    }

    void this.fire(req, key)
  }

  clearSession(sessionId: string): number {
    const sid = String(sessionId ?? '').trim()
    if (!sid) return 0
    const prefix = `${sid}\0`
    const clear = this.runtime?.clearTimeout ?? clearTimeout
    let cleared = 0
    for (const [key, timer] of [...this.deferTimers.entries()]) {
      if (!key.startsWith(prefix)) continue
      clear(timer)
      this.deferTimers.delete(key)
      cleared += 1
    }
    for (const key of [...this.inFlight]) {
      if (!key.startsWith(prefix)) continue
      this.inFlight.delete(key)
      cleared += 1
    }
    return cleared
  }

  isResumeInFlightForTests(sessionId: string, jobId?: string): boolean {
    return this.inFlight.has(resumeKey(sessionId, jobId))
  }

  resetForTests(): void {
    const clear = this.runtime?.clearTimeout ?? clearTimeout
    for (const timer of this.deferTimers.values()) clear(timer)
    this.deferTimers.clear()
    this.inFlight.clear()
    this.handler = null
    this.runtime = null
  }

  private scheduleBusyDefer(req: ResumeRequest, key: string): void {
    if (this.deferTimers.has(key)) return
    const setT = this.runtime?.setTimeout ?? setTimeout
    const clear = this.runtime?.clearTimeout ?? clearTimeout
    const timer = setT(() => {
      this.deferTimers.delete(key)
      this.enqueue(req)
    }, JOB_BUSY_DEFER_SECONDS * 1000)
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      try {
        ;(timer as { unref: () => void }).unref()
      } catch {
        /* ignore */
      }
    }
    const prev = this.deferTimers.get(key)
    if (prev) clear(prev)
    this.deferTimers.set(key, timer)
  }

  private async fire(req: ResumeRequest, key: string): Promise<void> {
    if (this.inFlight.has(key)) return
    this.inFlight.add(key)
    const clear = this.runtime?.clearTimeout ?? clearTimeout
    const defer = this.deferTimers.get(key)
    if (defer) {
      clear(defer)
      this.deferTimers.delete(key)
    }

    const handler = this.handler
    if (!handler) {
      this.inFlight.delete(key)
      console.warn('[resume-bus] handler unset; drop resume', key)
      return
    }

    const wakeMessage = this.formatMessage(req)
    try {
      await handler(req, wakeMessage)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[resume-bus] resume failed (${key}): ${msg}`)
    } finally {
      this.inFlight.delete(key)
    }
  }
}

export const sessionResumeBus: SessionResumeBus = new SessionResumeBusImpl()

export function getSessionResumeBus(): SessionResumeBus {
  return sessionResumeBus
}
