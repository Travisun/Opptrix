import { AshareEngine } from '@inno-a-stock/a-stock-layer'
import { EvaluationEngine } from '@inno-a-stock/stock-eval'
import { getMarketDataStore, MarketDataStore } from './store.js'
import { MarketDataSyncEngine, type SyncOptions } from './sync/engine.js'
import { getMarketSyncCoordinator, MarketSyncCoordinator, type SyncStateSnapshot } from './sync/coordinator.js'
import {
  localScreen,
  queryIndustryStats,
  queryRadarBatch,
  queryStockSnapshot,
  type ScreenCondition,
} from './query/screen.js'

export class MarketDataService {
  readonly store: MarketDataStore
  readonly de: AshareEngine
  readonly ee: EvaluationEngine
  readonly syncEngine: MarketDataSyncEngine
  readonly coordinator: MarketSyncCoordinator

  constructor(store = getMarketDataStore(), de = new AshareEngine(), ee?: EvaluationEngine) {
    this.store = store
    this.de = de
    this.ee = ee ?? new EvaluationEngine(de)
    this.syncEngine = new MarketDataSyncEngine(store, de)
    this.coordinator = getMarketSyncCoordinator(store, () => new MarketDataSyncEngine(store, de))
  }

  status() {
    return this.store.getStatus()
  }

  syncState(): SyncStateSnapshot {
    return this.coordinator.getSnapshot()
  }

  sync(options?: SyncOptions) {
    return this.coordinator.start(options)
  }

  autoResumeOnBoot() {
    this.coordinator.autoResumeOnBoot()
  }

  screen(conditions: ScreenCondition[], topN = 20, tradeDate?: string) {
    return localScreen(this.store, conditions, tradeDate, topN)
  }

  industryStats(tradeDate?: string) {
    return queryIndustryStats(this.store, tradeDate)
  }

  stockSnapshot(code: string) {
    return queryStockSnapshot(this.store, code)
  }

  radarBatch(codes: string[], tradeDate?: string) {
    return queryRadarBatch(this.store, codes, tradeDate)
  }
}

let sharedService: MarketDataService | null = null

export function getMarketDataService(): MarketDataService {
  if (!sharedService) sharedService = new MarketDataService()
  return sharedService
}

export { getMarketDataStore, MarketDataStore } from './store.js'
export type { MarketDbStatus } from './store.js'
export type { SyncOptions, SyncProgress, SyncMode } from './sync/engine.js'
export type { SyncStateSnapshot } from './sync/coordinator.js'
export type { ScreenCondition, LocalScreenItem } from './query/screen.js'
export { DAILY_SYNC_JOBS, type SyncSpeedProfile } from './sync/config.js'
export { marketDbPath, marketDataDir } from './paths.js'
