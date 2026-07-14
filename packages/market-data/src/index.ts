import { MarketDataEngine } from '@opptrix/a-stock-layer'
import { EvaluationEngine } from '@opptrix/stock-eval'
import { getMarketDataStore, MarketDataStore } from './store.js'
import { MarketDataSyncEngine, ALL_SYNC_JOBS, type SyncOptions } from './sync/engine.js'
import { getMarketSyncCoordinator, MarketSyncCoordinator, type SyncStateSnapshot } from './sync/coordinator.js'
import { resolveSyncPlan, resolveMarketPackSyncPlan, type SyncPlan } from './sync/plan.js'
import {
  loadMarketPackConfig,
  patchMarketPackConfig as saveMarketPackPatch,
} from './market-pack-settings.js'
import { allJobsForEnabledPacks } from './sync/market-packs.js'
import type { MarketDataPackConfig, MarketDataPackId, SupplementPackId } from '@opptrix/shared'
import { hydrateStocks, type HydrateManifest } from './sync/hydrate.js'
import {
  exportMarketDataPackage,
  importMarketDataPackageToDisk,
  inspectMarketDataPackage,
  PACKAGE_KIND_SUPPLEMENT,
  type MarketDataPackageInspectResult,
  type MarketDataPackageMetadata,
} from './package.js'
import {
  exportMarketDataPackSupplement,
  mergeMarketDataPackSupplement,
  suggestPackFilename,
  isSupplementPackage,
} from './package-pack.js'
import { registerMarketDataServiceReset, resetMarketDataRuntime } from './runtime.js'
import { MarketDataLifecycle } from './sync/lifecycle.js'
import { queryLocalDailyKlines, queryLocalLatestQuote } from './query/local-bars.js'
import { searchUniverseStocks } from './query/search-stocks.js'
import { buildEtfScorecardSchema, computeEtfScorecard } from './query/etf-scorecard.js'
import { searchLocalInstruments, listLocalInstrumentsSummary } from './query/search-instruments.js'

export class MarketDataService {
  readonly store: MarketDataStore
  readonly de: MarketDataEngine
  readonly ee: EvaluationEngine
  readonly syncEngine: MarketDataSyncEngine
  readonly coordinator: MarketSyncCoordinator
  private readonly lifecycle = new MarketDataLifecycle()

  constructor(store = getMarketDataStore(), de = new MarketDataEngine(), ee?: EvaluationEngine) {
    this.store = store
    this.de = de
    this.ee = ee ?? new EvaluationEngine(de)
    this.syncEngine = new MarketDataSyncEngine(store, de)
    this.coordinator = getMarketSyncCoordinator(store, () => new MarketDataSyncEngine(store, de))
  }

  status() {
    return this.coordinator.getCachedDbStatus()
  }

  /** Lightweight status for Agent / API — no DuckDB full-table stats */
  statusLight() {
    return this.store.getStatusLight()
  }

  syncState(): SyncStateSnapshot {
    return this.coordinator.getSnapshot()
  }

  sync(options?: SyncOptions) {
    return this.coordinator.start(options)
  }

  /** Resolve mode/jobs from DB state; optional force → full rebuild of enabled packs. */
  planSync(force = false): SyncPlan {
    const packs = loadMarketPackConfig()
    if (force) {
      return { mode: 'full', jobs: allJobsForEnabledPacks(packs), label: '全量重拉' }
    }
    const session = this.store.getLatestSession()
    return resolveSyncPlan(this.statusLight(), session)
  }

  marketPackConfig(): MarketDataPackConfig {
    return loadMarketPackConfig()
  }

  updateMarketPackConfig(
    patch: Partial<Record<MarketDataPackId, Partial<{ enabled: boolean; prepared_at?: string | null }>>>,
  ): MarketDataPackConfig {
    return saveMarketPackPatch(patch)
  }

  /** Enable optional pack and sync its jobs in background. */
  prepareMarketPack(pack: MarketDataPackId, force = false) {
    if (pack !== 'cn') {
      saveMarketPackPatch({ [pack]: { enabled: true } })
    }
    const plan = resolveMarketPackSyncPlan(pack, force)
    return this.coordinator.start({
      mode: plan.mode,
      jobs: [...plan.jobs],
      force,
      background: true,
      marketPack: pack,
    }).then(result => ({ ...result, plan }))
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

  /** Boot sync disabled — no automatic local universe / factor jobs. */
  autoSyncOnBoot() {
    /* no-op */
  }

  /** UI shell ready — boot sync disabled, lifecycle no-op. */
  notifyUiReady() {
    this.lifecycle.notifyUiReady(() => this.autoSyncOnBoot())
  }

  /** Headless fallback — same no-op as notifyUiReady */
  ensureBootSyncFallback() {
    this.lifecycle.ensureBootSyncFallback(() => this.autoSyncOnBoot())
  }

  /** @deprecated Use notifyUiReady */
  autoSyncWithFilter(_allowedJobs: readonly string[]) {
    this.notifyUiReady()
  }

  /** @deprecated Use autoSyncOnBoot */
  autoResumeOnBoot() {
    this.autoSyncOnBoot()
  }

  etfScorecard(code: string) {
    return computeEtfScorecard(this.store, code)
  }

  etfScorecardSchema() {
    return buildEtfScorecardSchema()
  }

  searchLocalInstruments(keyword: string, limit = 30, markets?: import('@opptrix/shared').Market[]) {
    return searchLocalInstruments(this.store, keyword, limit, markets)
  }

  localInstrumentsSummary() {
    return listLocalInstrumentsSummary(this.store)
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

  listLocalEtfs(limit = 5000) {
    return this.store.listEtfInstruments(limit)
  }

  listLocalUsEquities(limit = 5000) {
    return this.store.listUsInstruments(limit)
  }

  searchLocalUsEquities(keyword: string, limit = 30) {
    return this.store.searchUsInstruments(keyword, limit)
  }

  searchLocalEtfs(keyword: string, limit = 30) {
    return this.store.searchEtfInstruments(keyword, limit)
  }

  listLocalCryptoPairs(limit = 5000) {
    return this.store.listCryptoInstruments(limit)
  }

  searchLocalCryptoPairs(keyword: string, limit = 30) {
    return this.store.searchCryptoInstruments(keyword, limit)
  }

  localEtfProfile(code: string) {
    return this.store.getEtfProfile(code)
  }

  localEtfNav(code: string, limit = 120) {
    return this.store.getEtfNavHistory(code, limit)
  }

  localEtfHoldings(code: string, limit = 100) {
    return this.store.getEtfHoldings(code, limit)
  }

  /** L1 on-demand: shareholders / partners with quarterly TTL. */
  hydrateStocks(codes: string[], manifest: HydrateManifest = 'watchlist') {
    return hydrateStocks(this.store, this.de, codes, manifest)
  }

  async exportPackage(pack?: SupplementPackId): Promise<Buffer> {
    if (this.coordinator.isRunning()) {
      throw new Error('同步进行中，请稍后再导出')
    }
    if (pack) {
      return exportMarketDataPackSupplement(this.store, pack)
    }
    return exportMarketDataPackage(this.store)
  }

  /** @deprecated Use exportPackage() */
  async exportFullPackage(): Promise<Buffer> {
    return this.exportPackage()
  }

  inspectPackage(buffer: Buffer): MarketDataPackageInspectResult {
    return inspectMarketDataPackage(buffer)
  }

  importPackage(buffer: Buffer, opts?: { merge?: boolean }): MarketDataPackageMetadata {
    if (this.coordinator.isRunning()) {
      throw new Error('同步进行中，请稍后再导入')
    }
    const preview = inspectMarketDataPackage(buffer)
    if (!preview.valid || !preview.metadata) {
      throw new Error(preview.error ?? '数据包无效')
    }
    if (preview.metadata.kind === PACKAGE_KIND_SUPPLEMENT || opts?.merge) {
      resetMarketDataRuntime()
      const metadata = mergeMarketDataPackSupplement(buffer)
      getMarketDataService()
      return metadata
    }
    resetMarketDataRuntime()
    const metadata = importMarketDataPackageToDisk(buffer)
    getMarketDataService()
    return metadata
  }
}

let sharedService: MarketDataService | null = null

export function resetSharedMarketDataService(): void {
  if (sharedService) {
    try {
      sharedService.store.close()
    } catch {
      // ignore close races during import
    }
    sharedService = null
  }
}

registerMarketDataServiceReset(resetSharedMarketDataService)

export function getMarketDataService(): MarketDataService {
  if (!sharedService) sharedService = new MarketDataService()
  return sharedService
}

export { getMarketDataStore, MarketDataStore } from './store.js'
export {
  getMarketDuckGateway,
  resetMarketDuckGateways,
  invalidateHasMarketDuckDataCache,
  type MarketDuckGateway,
  type MarketDuckStats,
} from './duck/market-duck-gateway.js'
export type { MarketDbStatus, BootstrapReadiness, DerivedReadiness } from './store.js'
export type { SyncOptions, SyncProgress, SyncMode } from './sync/engine.js'
export type { SyncStateSnapshot } from './sync/coordinator.js'
export type { LocalInstrumentHit } from './query/search-instruments.js'
export { buildEtfScorecardSchema, ETF_SCORECARD_NAME } from './query/etf-scorecard.js'
export type { EtfScorecardResult, EtfScorecardDimension } from './query/etf-scorecard.js'
export { searchUniverseStocks } from './query/search-stocks.js'
export {
  BOOTSTRAP_SYNC_JOBS,
  CN_BOOTSTRAP_SYNC_JOBS,
  CN_MAINTENANCE_SYNC_JOBS,
  CN_AUTO_SYNC_JOB_UNIVERSE,
  CN_CORE_SYNC_JOBS,
  CN_MANUAL_SYNC_JOBS,
  DEFAULT_AUTO_SYNC_JOBS,
  DEFAULT_DAILY_SYNC_JOBS,
  LEGACY_INITIAL_SYNC_JOBS,
  STOCKINDEX_LIST_SYNC_JOBS,
  DAILY_SYNC_JOBS,
  ALL_SYNC_JOBS,
  AUTO_BOOT_EXCLUDED_JOBS,
  KLINE_BOOTSTRAP_DAYS,
  type SyncSpeedProfile,
} from './sync/config.js'
export {
  CN_WEEKLY_MAINTENANCE_DAYS,
  CN_MARKET_CLOSE_HOUR,
  beijingClock,
  isCnMondayAfterMarketClose,
  cnUniverseMaintenanceDue,
  cnTaxonomyMaintenanceDue,
  cnKlineDailyMaintenanceDue,
  cnMaintenanceJobsDue,
} from './sync/schedule.js'
export {
  filterJobsForAutoBoot,
  resolveSyncPlan,
  resolveAutoBootPlan,
  resolveMarketPackSyncPlan,
  shouldAutoSyncOnBoot,
  dailyJobsNeedRefresh,
  type SyncPlan,
} from './sync/plan.js'
export type { HydrateManifest } from './sync/hydrate.js'
export { loadMarketPackConfig, patchMarketPackConfig, saveMarketPackConfig, markMarketPackPrepared, normalizeMarketPackConfig } from './market-pack-settings.js'
export { PACK_JOBS, filterJobsByMarketPacks, jobsForMarketPack, allJobsForEnabledPacks } from './sync/market-packs.js'
export type { MarketDataPackConfig, MarketDataPackId } from '@opptrix/shared'
export { MARKET_PACK_LABELS, MARKET_PACK_DESCRIPTIONS, DEFAULT_MARKET_DATA_PACK_CONFIG } from '@opptrix/shared'
export { marketDbPath, marketDataDir } from './paths.js'
export {
  exportMarketDataPackage,
  importMarketDataPackageToDisk,
  inspectMarketDataPackage,
  suggestPackageFilename,
  PACKAGE_FILE_EXTENSION,
  PACKAGE_MIME,
  PACKAGE_FORMAT_VERSION,
  PACKAGE_KIND_SUPPLEMENT,
  type MarketDataPackageMetadata,
  type MarketDataPackageInspectResult,
} from './package.js'
export {
  exportMarketDataPackSupplement,
  mergeMarketDataPackSupplement,
  suggestPackFilename,
  isSupplementPackage,
  type SupplementPackId,
} from './package-pack.js'
export { resetMarketDataRuntime } from './runtime.js'
