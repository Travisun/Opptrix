/**
 * 全局主机名限流器
 *
 * 所有 Provider 共享同一实例，确保对同一主机名的请求间隔 >= intervalMs。
 *
 * 使用方法：
 *   await hostnameLimiter.acquire(hostname)
 *   try { await doRequest() } finally { hostnameLimiter.release(hostname) }
 *
 * 或通过 acquireWith 回调：
 *   await hostnameLimiter.acquireWith(hostname, () => doRequest())
 */

interface HostState {
  busy: boolean
  doneAt: number
  queue: Array<() => void>
}

class HostnameRateLimiter {
  private hosts = new Map<string, HostState>()
  private intervalMs: number

  constructor(intervalMs = 1000) {
    this.intervalMs = intervalMs
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

  /** 调试用：获取各主机名状态 */
  status(): Record<string, { busy: boolean; doneAt: number; queued: number }> {
    const out: Record<string, { busy: boolean; doneAt: number; queued: number }> = {}
    for (const [h, s] of this.hosts) {
      out[h] = { busy: s.busy, doneAt: s.doneAt, queued: s.queue.length }
    }
    return out
  }
}

/** 全局单例 — 所有 Provider 共享，默认 1s 间隔 */
export const hostnameLimiter = new HostnameRateLimiter(1000)

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
