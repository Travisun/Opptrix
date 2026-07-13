import { MarketDataEngine } from '@opptrix/a-stock-layer'
import { EvaluationEngine } from '@opptrix/stock-eval'
import { getMarketDataStore, MarketDataStore } from './store.js'
import { MarketDataSyncEngine, ALL_SYNC_JOBS, type SyncOptions } from './sync/engine.js'
import { getMarketSyncCoordinator, MarketSyncCoordinator, type SyncStateSnapshot } from './sync/coordinator.js'
import {
  getMarketDerivedMaintenanceCoordinator,
  type DerivedMaintenanceSnapshot,
} from './sync/derived-coordinator.js'
import { resolveSyncPlan, resolveAutoBootPlan, resolveMarketPackSyncPlan, type SyncPlan } from './sync/plan.js'
import {
  loadMarketPackConfig,
  patchMarketPackConfig as saveMarketPackPatch,
} from './market-pack-settings.js'
import { allJobsForEnabledPacks } from './sync/market-packs.js'
import type { MarketDataPackConfig, MarketDataPackId, SupplementPackId } from '@opptrix/shared'
import { hydrateStocks, type HydrateManifest } from './sync/hydrate.js'
import { LOCAL_OFFLINE_SCREENING_ENABLED } from './sync/instrument-gateway.js'
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
import { buildLocalEtfScreenSchema, localEtfScreen, type LocalEtfScreenQuery } from './query/etf-screen.js'
import { buildEtfScorecardSchema, computeEtfScorecard } from './query/etf-scorecard.js'
import { searchLocalInstruments, listLocalInstrumentsSummary } from './query/search-instruments.js'
import { buildLocalUsScreenSchema, localUsScreen, type LocalUsScreenQuery } from './query/us-screen.js'
import { buildLocalCryptoScreenSchema, localCryptoScreen, type LocalCryptoScreenQuery } from './query/crypto-screen.js'
import {
  buildLocalHkScreenSchema,
  buildLocalJpScreenSchema,
  buildLocalKrScreenSchema,
  localHkScreen,
  localJpScreen,
  localKrScreen,
  type LocalJpScreenQuery,
} from './query/regional-equity-screen.js'
import { listScreenFactors } from './query/factors.js'

export class MarketDataService {
  readonly store: MarketDataStore
  readonly de: MarketDataEngine
  readonly ee: EvaluationEngine
  readonly syncEngine: MarketDataSyncEngine
  readonly coordinator: MarketSyncCoordinator
  readonly derivedCoordinator: ReturnType<typeof getMarketDerivedMaintenanceCoordinator>
  private readonly lifecycle = new MarketDataLifecycle()

  constructor(store = getMarketDataStore(), de = new MarketDataEngine(), ee?: EvaluationEngine) {
    this.store = store
    this.de = de
    this.ee = ee ?? new EvaluationEngine(de)
    this.syncEngine = new MarketDataSyncEngine(store, de)
    this.coordinator = getMarketSyncCoordinator(store, () => new MarketDataSyncEngine(store, de))
    this.derivedCoordinator = getMarketDerivedMaintenanceCoordinator(store, () => this.coordinator.isRunning())
  }

  status() {
    return this.coordinator.getCachedDbStatus()
  }

  /** Lightweight status for Agent / API — no DuckDB full-table stats */
  statusLight() {
    return this.store.getStatusLight()
  }

  isOfflineScreeningEnabled() {
    return LOCAL_OFFLINE_SCREENING_ENABLED
  }

  syncState(): SyncStateSnapshot & { derived_maintenance: DerivedMaintenanceSnapshot } {
    const snap = this.coordinator.getSnapshot()
    return {
      ...snap,
      derived_maintenance: this.derivedCoordinator.getSnapshot(snap.db_status),
    }
  }

  autoDerivedMaintenanceOnBoot() {
    this.derivedCoordinator.autoMaintainOnBoot()
  }

  derivedMaintenance(force = true) {
    return this.derivedCoordinator.start({ force })
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

  autoSyncOnBoot() {
    this.coordinator.autoSyncOnBoot()
    this.coordinator.startRefreshScheduler()
  }

  /** UI shell ready — trigger L0 boot sync once (via resolveAutoBootPlan). */
  notifyUiReady() {
    this.lifecycle.notifyUiReady(() => this.autoSyncOnBoot())
  }

  /** Headless / broken client fallback — same as notifyUiReady but idempotent. */
  ensureBootSyncFallback() {
    this.lifecycle.ensureBootSyncFallback(() => this.autoSyncOnBoot())
  }

  /** @deprecated Use notifyUiReady — kept for callers migrating off autoSyncWithFilter */
  autoSyncWithFilter(_allowedJobs: readonly string[]) {
    this.notifyUiReady()
  }

  /** @deprecated Use autoSyncOnBoot */
  autoResumeOnBoot() {
    this.autoSyncOnBoot()
  }

  screen(conditions: ScreenCondition[], topN = 20, tradeDate?: string) {
    return localScreen(this.store, conditions, tradeDate, topN)
  }

  universeScreen(query: LocalUniverseScreenQuery) {
    return localUniverseScreen(this.store, query)
  }

  universeScreenSchema() {
    return buildLocalUniverseScreenSchema(this.statusLight().latest_factor_date)
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

  etfScreen(query: LocalEtfScreenQuery) {
    return localEtfScreen(this.store, query)
  }

  etfScreenSchema() {
    return buildLocalEtfScreenSchema()
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

  usScreen(query: LocalUsScreenQuery) {
    return localUsScreen(this.store, query)
  }

  usScreenSchema() {
    return buildLocalUsScreenSchema()
  }

  cryptoScreen(query: LocalCryptoScreenQuery) {
    return localCryptoScreen(this.store, query)
  }

  cryptoScreenSchema() {
    return buildLocalCryptoScreenSchema()
  }

  jpScreen(query: LocalJpScreenQuery) {
    return localJpScreen(this.store, query)
  }

  jpScreenSchema() {
    return buildLocalJpScreenSchema()
  }

  krScreen(query: LocalJpScreenQuery) {
    return localKrScreen(this.store, query)
  }

  krScreenSchema() {
    return buildLocalKrScreenSchema()
  }

  hkScreen(query: LocalJpScreenQuery) {
    return localHkScreen(this.store, query)
  }

  hkScreenSchema() {
    return buildLocalHkScreenSchema()
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
      sharedService.de.stopProviderDirWatcher()
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
export type { DerivedMaintenanceSnapshot } from './sync/derived-coordinator.js'
export type { ScreenCondition, LocalScreenItem, DiscoverCandidateRow, LocalUniverseScreenQuery, LocalUniverseScreenResult, LocalIndustryScreenQuery, IndustryListItem } from './query/screen.js'
export type { LocalEtfScreenQuery, LocalEtfScreenResult, LocalEtfScreenItem } from './query/etf-screen.js'
export type { LocalInstrumentHit } from './query/search-instruments.js'
export type { LocalUsScreenQuery, LocalUsScreenResult, LocalUsScreenItem } from './query/us-screen.js'
export type { LocalCryptoScreenQuery, LocalCryptoScreenResult, LocalCryptoScreenItem } from './query/crypto-screen.js'
export { buildLocalEtfScreenSchema } from './query/etf-screen.js'
export { buildLocalUsScreenSchema } from './query/us-screen.js'
export { buildLocalCryptoScreenSchema } from './query/crypto-screen.js'
export { buildEtfScorecardSchema, ETF_SCORECARD_NAME } from './query/etf-scorecard.js'
export type { EtfScorecardResult, EtfScorecardDimension } from './query/etf-scorecard.js'
export { buildLocalUniverseScreenSchema } from './query/screen-schema.js'
export type { LocalUniverseScreenSchema } from './query/screen-schema.js'
export { listScreenFactors, SCREEN_FACTOR_LABELS } from './query/factors.js'
export { searchUniverseStocks } from './query/search-stocks.js'
export {
  BOOTSTRAP_SYNC_JOBS,
  CN_BOOTSTRAP_SYNC_JOBS,
  CN_MAINTENANCE_SYNC_JOBS,
  CN_AUTO_SYNC_JOB_UNIVERSE,
  CN_CORE_SYNC_JOBS,
  CN_MANUAL_SYNC_JOBS,
  DEFAULT_AUTO_SYNC_JOBS,
  CN_DERIVED_MAINTENANCE_JOBS,
  DEFAULT_DAILY_SYNC_JOBS,
  LEGACY_INITIAL_SYNC_JOBS,
  STOCKINDEX_LIST_SYNC_JOBS,
  DAILY_SYNC_JOBS,
  ALL_SYNC_JOBS,
  AUTO_BOOT_EXCLUDED_JOBS,
  SCREEN_PACK_FACTORS,
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
