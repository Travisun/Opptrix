import { resetSharedMarketSyncCoordinator } from './sync/coordinator.js'
import { resetSharedMarketDataStore } from './store.js'
import { stopMarketDataRefreshScheduler } from './sync/scheduler.js'
import { resetMarketDuckGateways } from './duck/market-duck-gateway.js'

let resetServiceHook: (() => void) | null = null

/** Register service singleton reset (avoids circular import from index). */
export function registerMarketDataServiceReset(fn: () => void): void {
  resetServiceHook = fn
}

/** Close DB handles and drop in-memory singletons before replacing market.db on disk. */
export function resetMarketDataRuntime(): void {
  stopMarketDataRefreshScheduler()
  resetServiceHook?.()
  resetSharedMarketDataStore()
  resetSharedMarketSyncCoordinator()
  resetMarketDuckGateways()
}
