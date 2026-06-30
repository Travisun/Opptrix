import { AshareEngine } from '@inno-a-stock/a-stock-layer'
import { EvaluationEngine } from '@inno-a-stock/stock-eval'
import { getMarketDataStore, MarketDataStore } from './store.js'
import { MarketDataSyncEngine, ALL_SYNC_JOBS, type SyncOptions } from './sync/engine.js'
import { getMarketSyncCoordinator, MarketSyncCoordinator, type SyncStateSnapshot } from './sync/coordinator.js'
import { resolveSyncPlan, type SyncPlan } from './sync/plan.js'
import { hydrateStocks, type HydrateManifest } from './sync/hydrate.js'
import {
  localScreen,
  localUniverseScreen,
  queryDiscoverCandidates,
  queryIndustryList,
  queryIndustryStats,
  queryIndustryStocks,
  localIndustryScreen,
  queryRadarBatch,
  queryStockSnapshot,
  type LocalUniverseScreenQuery,
  type LocalUniverseScreenResult,
  type LocalIndustryScreenQuery,
  type IndustryListItem,
  type ScreenCondition,
  type DiscoverCandidateRow,
} from './query/screen.js'
import { queryLocalDailyKlines, queryLocalLatestQuote } from './query/local-bars.js'
import { searchUniverseStocks } from './query/search-stocks.js'
import { buildLocalUniverseScreenSchema } from './query/screen-schema.js'
import { listScreenFactors } from './query/factors.js'

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

  /** Resolve mode/jobs from DB state; optional force → full rebuild. */
  planSync(force = false): SyncPlan {
    if (force) {
      return { mode: 'full', jobs: [...ALL_SYNC_JOBS], label: '全量重拉' }
    }
    const session = this.store.getLatestSession()
    return resolveSyncPlan(this.status(), session)
  }

  syncAdaptive(force = false) {
    const plan = this.planSync(force)
    return this.coordinator.start({
      mode: plan.mode,
      jobs: [...plan.jobs],
      force,
      background: true,
    }).then(result => ({ ...result, plan }))
  }

  autoSyncOnBoot() {
    this.coordinator.autoSyncOnBoot()
    this.coordinator.startRefreshScheduler()
  }

  /** @deprecated Use autoSyncOnBoot */
  autoResumeOnBoot() {
    this.autoSyncOnBoot()
  }

  screen(conditions: ScreenCondition[], topN = 20, tradeDate?: string) {
    return localScreen(this.store, conditions, tradeDate, topN)
  }

  universeScreen(query: LocalUniverseScreenQuery): LocalUniverseScreenResult {
    return localUniverseScreen(this.store, query)
  }

  universeScreenSchema() {
    return buildLocalUniverseScreenSchema(this.status().latest_factor_date)
  }

  industryStats(tradeDate?: string) {
    return queryIndustryStats(this.store, tradeDate)
  }

  industryList(keyword?: string, tradeDate?: string, limit?: number) {
    return queryIndustryList(this.store, { keyword, trade_date: tradeDate, limit })
  }

  industryScreen(query: LocalIndustryScreenQuery) {
    return localIndustryScreen(this.store, query)
  }

  industryStocks(industry: string, tradeDate?: string, limit = 120) {
    return queryIndustryStocks(this.store, industry, tradeDate, limit)
  }

  stockSnapshot(code: string) {
    return queryStockSnapshot(this.store, code)
  }

  searchStocks(keyword: string, limit = 30) {
    return searchUniverseStocks(this.store, keyword, limit)
  }

  localLatestQuote(code: string) {
    return queryLocalLatestQuote(this.store, code)
  }

  localDailyKlines(code: string, limit = 800, before?: string) {
    return queryLocalDailyKlines(this.store, code, limit, before)
  }

  radarBatch(codes: string[], tradeDate?: string) {
    return queryRadarBatch(this.store, codes, tradeDate)
  }

  listScreenFactors() {
    return listScreenFactors()
  }

  discoverCandidates(codes: string[], factorNames?: readonly string[], tradeDate?: string) {
    const names = factorNames?.length ? factorNames : listScreenFactors().map(f => f.name)
    return queryDiscoverCandidates(this.store, codes, names, tradeDate)
  }

  /** L1 on-demand: shareholders / partners with quarterly TTL. */
  hydrateStocks(codes: string[], manifest: HydrateManifest = 'watchlist') {
    return hydrateStocks(this.store, this.de, codes, manifest)
  }
}

let sharedService: MarketDataService | null = null

export function getMarketDataService(): MarketDataService {
  if (!sharedService) sharedService = new MarketDataService()
  return sharedService
}

export { getMarketDataStore, MarketDataStore } from './store.js'
export type { MarketDbStatus, BootstrapReadiness } from './store.js'
export type { SyncOptions, SyncProgress, SyncMode } from './sync/engine.js'
export type { SyncStateSnapshot } from './sync/coordinator.js'
export type { ScreenCondition, LocalScreenItem, DiscoverCandidateRow, LocalUniverseScreenQuery, LocalUniverseScreenResult, LocalIndustryScreenQuery, IndustryListItem } from './query/screen.js'
export { buildLocalUniverseScreenSchema } from './query/screen-schema.js'
export type { LocalUniverseScreenSchema } from './query/screen-schema.js'
export { listScreenFactors, SCREEN_FACTOR_LABELS } from './query/factors.js'
export { searchUniverseStocks } from './query/search-stocks.js'
export {
  BOOTSTRAP_SYNC_JOBS,
  DAILY_SYNC_JOBS,
  ALL_SYNC_JOBS,
  SCREEN_PACK_FACTORS,
  KLINE_BOOTSTRAP_DAYS,
  type SyncSpeedProfile,
} from './sync/config.js'
export type { HydrateManifest } from './sync/hydrate.js'
export { resolveSyncPlan, resolveAutoBootPlan, shouldAutoSyncOnBoot, dailyJobsNeedRefresh, type SyncPlan } from './sync/plan.js'
export { marketDbPath, marketDataDir } from './paths.js'
