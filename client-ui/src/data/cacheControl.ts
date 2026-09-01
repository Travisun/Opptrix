/**
 * 客户端缓存 / 轮询辅助 — 策略常量见 @opptrix/shared/ui-cache-policy。
 */

export {
  UI_CACHE_TTL_MS as CACHE_TTL_MS,
  UI_POLL_INTERVAL_MS as POLL_INTERVAL_MS,
  decideRevalidate,
  isCacheFresh,
  parseIsoToMs,
  resolveFetchedAtMs,
  type RevalidateMode,
} from '@opptrix/shared/ui-cache-policy'

export type VisibilityPoller = {
  acquire: () => void
  release: () => void
  dispose: () => void
}

/** 可见性感知的共享轮询器：document.hidden 时跳过 tick；ref-count 为 0 时不运行。 */
export function createVisibilityPoller(
  intervalMs: number,
  onTick: () => void,
): VisibilityPoller {
  let refCount = 0
  let timer: number | null = null

  const tick = () => {
    if (document.hidden) return
    onTick()
  }

  const start = () => {
    if (timer != null) return
    timer = window.setInterval(tick, intervalMs)
  }

  const stop = () => {
    if (timer == null) return
    window.clearInterval(timer)
    timer = null
  }

  return {
    acquire() {
      refCount += 1
      if (refCount === 1) start()
    },
    release() {
      refCount = Math.max(0, refCount - 1)
      if (refCount === 0) stop()
    },
    dispose() {
      refCount = 0
      stop()
    },
  }
}
