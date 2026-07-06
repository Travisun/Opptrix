/**
 * 全局主机名限流器
 *
 * 所有 Provider 共享同一实例，确保对同一主机名的请求间隔 >= intervalMs。
 *
 * 设计原则：
 * 1. 全局单例 — 不同 Provider 请求同一主机名受同一限流约束
 * 2. 按主机名隔离 — 不同主机名完全并行，互不影响
 * 3. 时间窗口检测 — 距上次请求完成 >= intervalMs 即可放行，无需排队
 * 4. 并发保护 — 同一主机名有请求在飞时，后续请求排队等候
 * 5. 错误不污染 — 无论成功失败都推进状态机，不会卡死队列
 * 6. 与重试解耦 — 重试发生在 fn() 内部，限流器只管调度间隔
 */

/** 单个主机名的限流状态 */
interface HostState {
  /** 是否有请求正在执行 */
  busy: boolean
  /** 上一次请求完成的时间戳（成功或失败都算完成） */
  doneAt: number
  /** 排队中的请求回调 */
  queue: Array<() => void>
}

/**
 * 全局主机名限流器（单例）
 *
 * 使用方法：
 *   await hostnameLimiter.acquire(hostname)
 *   try { await doRequest() } finally { hostnameLimiter.release(hostname) }
 *
 * 或通过 acquireWith 回调简化：
 *   await hostnameLimiter.acquireWith(hostname, () => doRequest())
 */
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

  /**
   * 获取主机名的访问许可
   *
   * 返回一个 Promise，在可以安全发起请求时 resolve。
   * 调用者必须在请求完成后调用 release()。
   *
   * 行为：
   * - 空闲 + 间隔足够 → 立即 resolve
   * - 空闲 + 间隔不够 → sleep 补齐后 resolve
   * - 忙碌 → 排队，等当前请求完成后依次唤醒
   */
  acquire(hostname: string): Promise<void> {
    const s = this.getState(hostname)

    // 空闲路径
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

    // 忙碌路径：排队
    return new Promise<void>((resolve) => {
      s.queue.push(resolve)
    })
  }

  /**
   * 释放主机名的访问许可，唤醒下一个排队者
   */
  release(hostname: string): void {
    const s = this.hosts.get(hostname)
    if (!s) return

    s.doneAt = Date.now()
    s.busy = false

    // 唤醒下一个
    const next = s.queue.shift()
    if (next) {
      s.busy = true
      // 下一个请求可能需要等待间隔
      const gap = Date.now() - s.doneAt
      if (gap >= this.intervalMs) {
        next()
      } else {
        setTimeout(() => next(), this.intervalMs - gap)
      }
    }
  }

  /**
   * 带回调的便捷方法 — 自动管理 acquire/release
   *
   * 无论 fn 成功或失败，都会正确释放许可。
   */
  async acquireWith<T>(hostname: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(hostname)
    try {
      return await fn()
    } finally {
      this.release(hostname)
    }
  }

  /** 调试用：获取各主机名状态 */
  status(): Record<string, { busy: boolean; doneAt: number; queued: number }> {
    const out: Record<string, { busy: boolean; doneAt: number; queued: number }> = {}
    for (const [h, s] of this.hosts) {
      out[h] = { busy: s.busy, doneAt: s.doneAt, queued: s.queue.length }
    }
    return out
  }

  /** 清理长时间未使用的主机名 */
  cleanup(maxAgeMs = 5 * 60 * 1000): void {
    const now = Date.now()
    for (const [h, s] of this.hosts) {
      if (!s.busy && now - s.doneAt > maxAgeMs) {
        this.hosts.delete(h)
      }
    }
  }

  /** 修改间隔（运行时可调） */
  setInterval(ms: number): void {
    this.intervalMs = ms
  }
}

/**
 * 全局单例 — 所有 Provider 共享
 *
 * 默认间隔 1 秒，确保对同一主机名的请求间隔 >= 1s，
 * 满足大多数网站的反爬要求和合法浏览间隔。
 */
export const hostnameLimiter = new HostnameRateLimiter(1000)

/**
 * 从 URL 提取主机名
 */
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
