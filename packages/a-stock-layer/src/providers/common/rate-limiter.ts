/**
 * 全局主机名限流器
 *
 * 所有 Provider 共享同一实例，确保对同一主机名的请求间隔 >= intervalMs。
 * 每 host 等待队列有界（maxQueued）；空闲 host 定期 prune，避免 Map 无限增长。
 * 默认 maxQueued=512，与 Hub 批量快照上限（200）全开并发排队对齐，仍保持每 host 单在途。
 *
 * 使用方法：
 *   await hostnameLimiter.acquire(hostname)
 *   try { await doRequest() } finally { hostnameLimiter.release(hostname) }
 *
 * 或通过 acquireWith 回调：
 *   await hostnameLimiter.acquireWith(hostname, () => doRequest())
 */

export interface HostnameRateLimiterOptions {
  /** 同 host 两次请求最小间隔（ms） */
  intervalMs?: number
  /** 每 host 等待队列上限；超限 acquire 立即 reject（默认 512） */
  maxQueued?: number
  /** 空闲 host 保留时长（ms）；busy/有排队时不 prune（默认 5min） */
  idleTtlMs?: number
  /** prune 周期（ms）；0 关闭自动 prune（默认 60s） */
  pruneIntervalMs?: number
}

interface HostState {
  busy: boolean
  doneAt: number
  queue: Array<() => void>
}

export class HostnameRateLimiter {
  private hosts = new Map<string, HostState>()
  private intervalMs: number
  private readonly maxQueued: number
  private readonly idleTtlMs: number
  private pruneTimer: ReturnType<typeof setInterval> | null = null

  constructor(intervalMsOrOpts: number | HostnameRateLimiterOptions = 1000) {
    const opts =
      typeof intervalMsOrOpts === 'number'
        ? { intervalMs: intervalMsOrOpts }
        : intervalMsOrOpts
    this.intervalMs = opts.intervalMs ?? 1000
    this.maxQueued = opts.maxQueued ?? 512
    this.idleTtlMs = opts.idleTtlMs ?? 5 * 60 * 1000
    const pruneEvery = opts.pruneIntervalMs ?? 60_000
    if (pruneEvery > 0) {
      this.pruneTimer = setInterval(() => this.pruneIdleHosts(), pruneEvery)
      // 不阻止进程退出
      if (typeof this.pruneTimer === 'object' && this.pruneTimer !== null && 'unref' in this.pruneTimer) {
        this.pruneTimer.unref()
      }
    }
  }

  private getState(hostname: string): HostState {
    let s = this.hosts.get(hostname)
    if (!s) {
      s = { busy: false, doneAt: 0, queue: [] }
      this.hosts.set(hostname, s)
    }
    return s
  }

  acquire(hostname: string): Promise<void> {
    const s = this.getState(hostname)

    if (!s.busy) {
      const gap = Date.now() - s.doneAt
      if (gap >= this.intervalMs) {
        s.busy = true
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        s.busy = true
        setTimeout(() => resolve(), this.intervalMs - gap)
      })
    }

    if (s.queue.length >= this.maxQueued) {
      return Promise.reject(
        new Error(`HostnameRateLimiter queue full for host "${hostname}" (maxQueued=${this.maxQueued})`),
      )
    }

    return new Promise<void>((resolve) => {
      s.queue.push(resolve)
    })
  }

  release(hostname: string): void {
    const s = this.hosts.get(hostname)
    if (!s) return

    s.doneAt = Date.now()
    s.busy = false

    const next = s.queue.shift()
    if (next) {
      s.busy = true
      const gap = Date.now() - s.doneAt
      if (gap >= this.intervalMs) {
        next()
      } else {
        setTimeout(() => next(), this.intervalMs - gap)
      }
    }
  }

  async acquireWith<T>(hostname: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(hostname)
    try {
      return await fn()
    } finally {
      this.release(hostname)
    }
  }

  setInterval(ms: number): void {
    this.intervalMs = ms
  }

  /** 移除空闲过久且无排队的 host 条目 */
  pruneIdleHosts(now = Date.now()): number {
    let removed = 0
    for (const [h, s] of this.hosts) {
      if (s.busy || s.queue.length > 0) continue
      if (now - s.doneAt < this.idleTtlMs) continue
      this.hosts.delete(h)
      removed++
    }
    return removed
  }

  /** 测试 / 关闭：停止 prune 定时器并清空 host 表 */
  dispose(): void {
    if (this.pruneTimer != null) {
      clearInterval(this.pruneTimer)
      this.pruneTimer = null
    }
    this.hosts.clear()
  }

  /** 调试用：获取各主机名状态 */
  status(): Record<string, { busy: boolean; doneAt: number; queued: number }> {
    const out: Record<string, { busy: boolean; doneAt: number; queued: number }> = {}
    for (const [h, s] of this.hosts) {
      out[h] = { busy: s.busy, doneAt: s.doneAt, queued: s.queue.length }
    }
    return out
  }

  /** 测试：当前跟踪的 host 数 */
  hostCount(): number {
    return this.hosts.size
  }
}

/**
 * 全局单例 — 所有 Provider 共享，默认 1s 间隔、每 host 单在途。
 * maxQueued=512：覆盖 Hub 批量快照上限（BATCH_INSTRUMENT_SNAPSHOTS_MAX=200）全开并发排队，
 * 并为同 host 其它在途请求留余量；仍禁止同 host 多在途。
 */
export const hostnameLimiter = new HostnameRateLimiter({
  intervalMs: 1000,
  maxQueued: 512,
})

export function extractHostname(url: string): string {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new URL(url).hostname
    }
    return new URL(`https://${url}`).hostname
  } catch {
    return 'unknown'
  }
}
