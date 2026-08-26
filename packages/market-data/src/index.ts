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
import { queryLocalLatestQuote } from './query/local-bars.js'
import { searchUniverseStocks } from './query/search-stocks.js'
import { buildEtfScorecardSchema, computeEtfScorecard, computeEtfScorecardFromOnline } from './query/etf-scorecard.js'
import { searchLocalInstruments, listLocalInstrumentsSummary } from './query/search-instruments.js'
import {
  ensureSearchUniverseReady as ensureSearchUniverseReadyImpl,
  type SearchUniverseReadyResult,
} from './sync/search-universe-ready.js'
import {
  runWatchlistLocalDisambiguationPass,
  runWatchlistOnlineDisambiguationPass,
} from './watchlist-disambiguate.js'

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

  /**
   * 搜索触发：检查 CN/HK/US 轻量名录是否就绪；缺则后台灌库（不 await 整次）。
   * boot 路径不调用本方法。
   */
  ensureSearchUniverseReady(): Promise<SearchUniverseReadyResult> {
    return ensureSearchUniverseReadyImpl({
      getCursorLastSuccess: job => this.store.getCursorLastSuccess(job),
      countEquity: market => this.store.countEquityInstruments(market),
      isRunning: () => this.coordinator.isRunning(),
      getSnapshot: () => this.coordinator.getSnapshot(),
      getSessionJobs: () => this.coordinator.getSessionJobs(),
      start: async jobs => {
        const result = await this.coordinator.start({
          mode: 'incremental',
          jobs,
          background: true,
        })
        return { started: result.started, running: result.running }
      },
    })
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

  etfScorecardFromOnline(input: Parameters<typeof computeEtfScorecardFromOnline>[0]) {
    return computeEtfScorecardFromOnline(input)
  }

  etfScorecardSchema() {
    return buildEtfScorecardSchema()
  }

  searchLocalInstruments(keyword: string, limit = 30, markets?: import('@opptrix/shared').Market[]) {
    return searchLocalInstruments(this.store, keyword, limit, markets)
  }

  /**
   * 关注列表未消歧：本地唯一写回；可选后台 Tickflow 唯一补强。
   * 返回最新列表（已写 user-store）。
   */
  disambiguateWatchlist(opts?: { online?: boolean }): {
    items: import('@opptrix/a-stock-layer').WatchlistItem[]
    resolvedLocal: number
    onlineStarted: boolean
    candidatesByCode: Record<string, import('@opptrix/a-stock-layer').DisambiguationCandidate[]>
  } {
    const current = this.de.watchlist.list()
    const local = runWatchlistLocalDisambiguationPass(current, (kw, limit) =>
      this.searchLocalInstruments(kw, limit ?? 30).map(h => ({
        instrument: h.instrument,
        name: h.name,
      })),
    )
    let items = local.items
    if (local.resolved > 0) {
      items = this.de.watchlist.replace(local.items)
      this.de.watchlist.flush()
    }

    const candidatesByCode = { ...local.candidatesByCode }

    const wantOnline = opts?.online !== false
    let onlineStarted = false
    if (wantOnline) {
      onlineStarted = true
      void runWatchlistOnlineDisambiguationPass(items).then(online => {
        if (online.resolved <= 0) return
        this.de.watchlist.replace(online.items)
        this.de.watchlist.flush()
      }).catch(err => {
        console.warn(
          '[market-data] watchlist online disambiguation failed:',
          err instanceof Error ? err.message : String(err),
        )
      })
    }

    return {
      items,
      resolvedLocal: local.resolved,
      onlineStarted,
      candidatesByCode,
    }
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

  localDailyKlines(_code: string, _limit = 800, _before?: string) {
    // 主库不再提供静态日 K；图表/诊断请走在线 queryInstrumentData('kline')
    return [] as import('@opptrix/shared').StockKline[]
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

  localFundProfile(code: string) {
    return this.store.getFundProfile(code)
  }

  getFundNavHistory(code: string, limit = 120) {
    return this.store.getFundNavHistory(code, limit)
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

export {
  getMarketDataStore,
  MarketDataStore,
  SYNC_LOGS_GLOBAL_MAX,
  SYNC_LOGS_PER_SESSION_MAX,
  SYNC_SESSIONS_KEEP_MAX,
} from './store.js'
export {
  getMarketDuckGateway,
  resetMarketDuckGateways,
  closeMarketDuckRuntime,
  invalidateHasMarketDuckDataCache,
  type MarketDuckGateway,
  type MarketDuckStats,
  type LatestBarRow,
  type LatestBarsPageOpts,
} from './duck/market-duck-gateway.js'
export {
  DEFAULT_DUCK_TEMP_MAX_AGE_MS,
  OPPTRIX_DUCK_TEMP_PREFIXES,
  listOpptrixDuckTempJson,
  pruneOrphanDuckTempJson,
  withCompactTempJsonAsync,
  withCompactTempJsonSync,
  type DuckTempJsonKind,
  type PruneOrphanDuckTempJsonOptions,
  type PruneOrphanDuckTempJsonResult,
} from './duck/duck-temp-json.js'
export {
  stitchLatestBarsPages,
  stitchLatestBarsPagesSync,
  resolveLatestBarsPageLimit,
  clampLatestBarsPageLimit,
  LATEST_BARS_PAGE_DEFAULT_LIMIT,
  LATEST_BARS_PAGE_LOW_MEM_LIMIT,
  LATEST_BARS_PAGE_MAX_LIMIT,
} from './duck/latest-bars-page.js'
export type { MarketDbStatus, BootstrapReadiness, DerivedReadiness } from './store.js'
export type { SyncOptions, SyncProgress, SyncMode } from './sync/engine.js'
export type { SyncStateSnapshot } from './sync/coordinator.js'
export type { LocalInstrumentHit } from './query/search-instruments.js'
export {
  ensureSearchUniverseReady,
  listMissingSearchUniverseJobs,
  SEARCH_UNIVERSE_JOB_SPECS,
} from './sync/search-universe-ready.js'
export type {
  SearchUniverseReadyResult,
  SearchUniversePrepStatus,
  SearchUniverseJobName,
} from './sync/search-universe-ready.js'
export { buildEtfScorecardSchema, computeEtfScorecardFromOnline, ETF_SCORECARD_NAME } from './query/etf-scorecard.js'
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
export {
  importAdjustmentFactors,
  fetchDownloadUrl,
  ensureParquetDownloaded,
  prepareFuyaoDump,
  prepareFuyaoDumpForAgent,
  parquetCachePath,
  isParquetCacheFresh,
  type DumpUrlFetcher,
  type FuyaoDumpApiKind,
  type DumpImportHooks,
  type DumpImportResult,
  type FuyaoDumpKind,
  type FuyaoDumpMode,
} from './sync/dump-import.js'
export {
  pruneMarketDumps,
  resolveMarketDumpsDir,
  resolveDumpsMaxAgeMs,
  resolveDumpsMaxBytes,
  resolveDumpsIncompleteMaxAgeMs,
  DEFAULT_DUMPS_MAX_AGE_MS,
  DEFAULT_DUMPS_MAX_BYTES,
  DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS,
  type PruneMarketDumpsOptions,
  type PruneMarketDumpsResult,
} from './sync/dumps-prune.js'
export {
  startPackageExportJob,
  getPackageExportJob,
  getPackageExportJobFilePath,
  resetPackageExportJobsForTests,
  awaitPackageExportJobsForTests,
  setPackageExportRunnerForTests,
  type PackageExportJobSnapshot,
  type PackageExportJobState,
} from './package-export-job.js'
export {
  prepareFuyaoDumpMaybeAsync,
  prepareFuyaoDumpForAgentAsync,
  getFuyaoDumpJob,
  isFuyaoDumpLocalCacheReady,
  resetFuyaoDumpJobsForTests,
  subscribeFuyaoDumpJob,
  type FuyaoDumpJobResult,
  type FuyaoDumpJobState,
} from './sync/fuyao-dump-job.js'
export {
  INSTRUMENTS_HK_CANONICAL_PAD_V1,
  planHkCanonicalPad,
  needsHkCanonicalPad,
  nameCompleteness,
  type HkInstrumentRow,
  type HkPadPlanItem,
} from './repair-hk-canonical-pad.js'
export {
  runWatchlistLocalDisambiguationPass,
  runWatchlistOnlineDisambiguationPass,
} from './watchlist-disambiguate.js'
