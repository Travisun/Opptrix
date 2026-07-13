import type { MarketDataStore } from '../store.js'
import type { MarketSyncCoordinator } from './coordinator.js'
import { resolveAutoBootPlan } from './plan.js'

/** Background tick interval — check stale data while app stays open. */
export const REFRESH_SCHEDULER_MS = Number(
  process.env.OPPTRIX_MARKET_REFRESH_INTERVAL_MS ?? 15 * 60 * 1000,
)

let timer: ReturnType<typeof setInterval> | null = null

export function startMarketDataRefreshScheduler(
  store: MarketDataStore,
  coordinator: MarketSyncCoordinator,
): void {
  if (timer != null) return

  const tick = () => {
    if (coordinator.isRunning()) return

    const status = store.getStatusLight()
    const session = store.getLatestSession()
    const plan = resolveAutoBootPlan(status, session)
    if (!plan) return

    void coordinator.start({
      mode: plan.mode,
      jobs: [...plan.jobs],
      background: true,
    })
  }

  timer = setInterval(tick, REFRESH_SCHEDULER_MS)
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
}

export function stopMarketDataRefreshScheduler(): void {
  if (timer != null) {
    clearInterval(timer)
    timer = null
  }
}
