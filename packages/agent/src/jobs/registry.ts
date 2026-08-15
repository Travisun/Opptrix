import {
  JOB_IN_FLIGHT_STATES,
  JOB_SNAPSHOT_TTL_MS,
  JOB_TERMINAL_STATES,
  type BackgroundJobKind,
  type BackgroundJobState,
} from './constants.js'
import type {
  BackgroundJobSnapshot,
  JobRegistry,
  JobRegistryEvent,
  JobRegistryListener,
} from './types.js'

function cloneSnapshot(s: BackgroundJobSnapshot): BackgroundJobSnapshot {
  return {
    ...s,
    progress: { ...s.progress },
    meta: s.meta ? { ...s.meta } : undefined,
  }
}

function isTerminal(state: BackgroundJobState): boolean {
  return JOB_TERMINAL_STATES.has(state)
}

class InMemoryJobRegistry implements JobRegistry {
  private readonly byId = new Map<string, BackgroundJobSnapshot>()
  private readonly listeners = new Set<JobRegistryListener>()
  private readonly cancelHandlers = new Map<
    BackgroundJobKind,
    (jobId: string) => Promise<boolean>
  >()

  get(jobId: string): BackgroundJobSnapshot | null {
    this.prune()
    const id = String(jobId ?? '').trim()
    if (!id) return null
    const snap = this.byId.get(id)
    return snap ? cloneSnapshot(snap) : null
  }

  list(filter?: {
    kind?: BackgroundJobKind
    states?: BackgroundJobState[]
  }): BackgroundJobSnapshot[] {
    this.prune()
    const states = filter?.states ? new Set(filter.states) : null
    const out: BackgroundJobSnapshot[] = []
    for (const snap of this.byId.values()) {
      if (filter?.kind && snap.kind !== filter.kind) continue
      if (states && !states.has(snap.state)) continue
      out.push(cloneSnapshot(snap))
    }
    return out
  }

  upsert(snapshot: BackgroundJobSnapshot): void {
    const id = String(snapshot.jobId ?? '').trim()
    if (!id) return
    const prev = this.byId.get(id)
    const next = cloneSnapshot({
      ...snapshot,
      jobId: id,
      updatedAtMs: snapshot.updatedAtMs || Date.now(),
    })
    this.byId.set(id, next)
    const wasTerminal = prev ? isTerminal(prev.state) : false
    const nowTerminal = isTerminal(next.state)
    if (nowTerminal && !wasTerminal) {
      this.emit({ type: 'terminal', snapshot: cloneSnapshot(next) })
    } else if (prev) {
      this.emit({ type: 'progress', snapshot: cloneSnapshot(next) })
    } else {
      this.emit({ type: 'upsert', snapshot: cloneSnapshot(next) })
    }
  }

  update(
    jobId: string,
    patch: Partial<Pick<
      BackgroundJobSnapshot,
      'state' | 'progress' | 'error' | 'meta' | 'suggestedWakeSeconds' | 'cancelable' | 'title'
    >>,
  ): BackgroundJobSnapshot | null {
    const id = String(jobId ?? '').trim()
    const prev = this.byId.get(id)
    if (!prev) return null
    const next: BackgroundJobSnapshot = {
      ...prev,
      ...patch,
      progress: patch.progress ? { ...prev.progress, ...patch.progress } : { ...prev.progress },
      meta: patch.meta !== undefined
        ? (patch.meta ? { ...patch.meta } : undefined)
        : (prev.meta ? { ...prev.meta } : undefined),
      updatedAtMs: Date.now(),
    }
    this.byId.set(id, next)
    const wasTerminal = isTerminal(prev.state)
    const nowTerminal = isTerminal(next.state)
    if (nowTerminal && !wasTerminal) {
      this.emit({ type: 'terminal', snapshot: cloneSnapshot(next) })
    } else {
      this.emit({ type: 'progress', snapshot: cloneSnapshot(next) })
    }
    return cloneSnapshot(next)
  }

  markTerminal(
    jobId: string,
    state: 'completed' | 'failed' | 'cancelled',
    patch?: Partial<BackgroundJobSnapshot>,
  ): BackgroundJobSnapshot | null {
    const id = String(jobId ?? '').trim()
    const prev = this.byId.get(id)
    if (!prev) return null
    if (isTerminal(prev.state)) {
      return cloneSnapshot(prev)
    }
    const next: BackgroundJobSnapshot = {
      ...prev,
      ...patch,
      state,
      progress: patch?.progress
        ? { ...prev.progress, ...patch.progress }
        : { ...prev.progress },
      updatedAtMs: Date.now(),
    }
    this.byId.set(id, next)
    this.emit({ type: 'terminal', snapshot: cloneSnapshot(next) })
    return cloneSnapshot(next)
  }

  subscribe(listener: JobRegistryListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setCancelHandler(
    kind: BackgroundJobKind,
    handler: ((jobId: string) => Promise<boolean>) | null,
  ): void {
    if (!handler) {
      this.cancelHandlers.delete(kind)
      return
    }
    this.cancelHandlers.set(kind, handler)
  }

  async requestCancel(jobId: string): Promise<{ ok: boolean; error?: string }> {
    const snap = this.get(jobId)
    if (!snap) return { ok: false, error: '找不到该后台任务' }
    if (!snap.cancelable) {
      return { ok: false, error: '该任务不支持取消，可继续等待或结束本轮等待' }
    }
    if (isTerminal(snap.state)) {
      return { ok: false, error: '任务已结束' }
    }
    const handler = this.cancelHandlers.get(snap.kind)
    if (!handler) {
      return { ok: false, error: '该任务暂不支持取消' }
    }
    try {
      const cancelled = await handler(snap.jobId)
      if (!cancelled) return { ok: false, error: '取消未生效' }
      this.markTerminal(snap.jobId, 'cancelled', {
        progress: { ...snap.progress, message: '已取消' },
        error: null,
      })
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg || '取消失败' }
    }
  }

  resetForTests(): void {
    this.byId.clear()
    this.listeners.clear()
    this.cancelHandlers.clear()
  }

  private emit(event: JobRegistryEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[job-registry] listener error: ${msg}`)
      }
    }
  }

  private prune(): void {
    const cutoff = Date.now() - JOB_SNAPSHOT_TTL_MS
    for (const [id, snap] of this.byId) {
      if (JOB_IN_FLIGHT_STATES.has(snap.state)) continue
      if (snap.updatedAtMs < cutoff) this.byId.delete(id)
    }
  }
}

export const jobRegistry: JobRegistry = new InMemoryJobRegistry()

export function getJobRegistry(): JobRegistry {
  return jobRegistry
}
