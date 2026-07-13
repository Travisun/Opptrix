import type { AshareEngine } from '@opptrix/a-stock-layer'
import { isBseCode, isTushareEnabled, isRegionalTradingDay, normalizeRegionalSymbol, parseCryptoPair, regionalTodayString, resolveMarket, usTodayString, type StockProfile } from '@opptrix/a-stock-layer'
import type { InstrumentRef, QueryResult, StockListItem, StockRealtime } from '@opptrix/shared'
import { normalizeInstrumentRef } from '@opptrix/shared'
import { createScorecard } from '@opptrix/stock-eval'
import { EvaluationEngine } from '@opptrix/stock-eval'
import type { MarketDataStore } from '../store.js'
import { daysSince, detectSt, minutesSince, normalizeStockCode, todayTradeDate } from '../utils.js'
import {
  cnKlineDailyMaintenanceDue,
  cnTaxonomyMaintenanceDue,
  cnUniverseMaintenanceDue,
} from './schedule.js'
import { SyncCachingEngine } from './cache-engine.js'
import {
  ALL_SYNC_JOBS,
  BOOTSTRAP_SYNC_JOBS,
  DEFAULT_API_MIN_GAP_MS,
  EASTMONEY_HEAVY_JOBS,
  getSyncProfileSettings,
  getTushareSyncBoost,
  isTushareBackedSyncJob,
  KLINE_BOOTSTRAP_DAYS,
  STOCKINDEX_LIST_SYNC_JOBS,
  type JobSyncConfig,
  type SyncSpeedProfile,
  SYNC_JOB_CONFIG,
} from './config.js'
import { importDailyKDump } from './dump-import.js'
import { getMarketDuckGateway } from '../duck/market-duck-gateway.js'
import { FuyaoClient, isTonghuashunEnabled, loadTonghuashunConfig } from '@opptrix/a-stock-layer'
import { runLocalScreenFactors } from './local-factors.js'
import { mapPool, sleep, withRetry } from './pool.js'
import { ApiThrottler } from './throttle.js'
import { isRegionalListJob, isRegionalQuotesJob, regionalListJobMarket, regionalQuotesJobMarket } from './regional-list-seeds.js'
import { StandardInstrumentGateway } from './instrument-gateway.js'
import type { InitialSyncCallbacks } from './initial-sync.js'
import { syncInitialCnEtf } from './stockindex-etf.js'
import { syncInitialStockIndexUniverse } from './stockindex-universe.js'
import { syncAllInitialTaxonomy } from './stockindex-taxonomy.js'
import type { InitialEquityMarket } from './instrument-gateway.js'
import { cnEtfListRef, cnEtfRef, cnLegacyProviderCode, cnRefFromCode } from './instrument-gateway.js'

function equityInstrumentRef(
  market: 'US' | 'JP' | 'KR' | 'HK',
  code: string,
): InstrumentRef {
  const symbol = market === 'US' ? code : normalizeRegionalSymbol(market, code)
  return normalizeInstrumentRef({ market, assetClass: 'EQUITY', symbol })
}

function cryptoInstrumentRef(code: string): InstrumentRef {
  const pair = parseCryptoPair(code)
  if (pair) {
    return normalizeInstrumentRef({
      market: 'CRYPTO',
      assetClass: 'CRYPTO_SPOT',
      symbol: pair.base,
      quote: pair.quote,
      exchange: 'binance',
    })
  }
  return normalizeInstrumentRef({
    market: 'CRYPTO',
    assetClass: 'CRYPTO_SPOT',
    symbol: code,
    quote: 'USDT',
    exchange: 'binance',
  })
}

function deStockListQuery(
  de: AshareEngine,
  market: 'US' | 'CRYPTO' | 'JP' | 'KR' | 'HK',
  keyword = '',
): Promise<QueryResult<StockListItem[]>> {
  const ref: InstrumentRef = market === 'US'
    ? { market: 'US', assetClass: 'EQUITY', symbol: 'SPY' }
    : market === 'CRYPTO'
      ? { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: 'BTC', quote: 'USDT' }
      : { market, assetClass: 'EQUITY', symbol: '0000' }
  return de.queryInstrumentData(ref, 'stock_list', { keyword }) as Promise<QueryResult<StockListItem[]>>
}

function deRealtimeQuery(de: AshareEngine, ref: InstrumentRef): Promise<QueryResult<StockRealtime[]>> {
  return de.queryInstrumentData(ref, 'realtime') as Promise<QueryResult<StockRealtime[]>>
}

export { ALL_SYNC_JOBS, BOOTSTRAP_SYNC_JOBS, CN_MANUAL_SYNC_JOBS } from './config.js'

import type { MarketDataPackId } from '@opptrix/shared'

export type SyncMode = 'full' | 'incremental' | 'resume'

export interface SyncProgress {
  job: string
  current: number
  total: number
  message?: string
}

export interface SyncOptions {
  mode?: SyncMode
  jobs?: string[]
  /** When set, coordinator marks pack prepared after successful sync */
  marketPack?: MarketDataPackId
  concurrency?: number
  delayMs?: number
  apiGapMs?: number
  /** safe | balanced | fast — default balanced, override via OPPTRIX_MARKET_SYNC_PROFILE */
  profile?: SyncSpeedProfile | string
  maxStocks?: number
  force?: boolean
  background?: boolean
  onProgress?: (p: SyncProgress) => void
  onJobStart?: (job: string, index: number, total: number) => void
  onJobFinish?: (job: string, status: string, index: number) => void
  onLog?: (message: string) => void
}

function shouldRefresh(syncedAt: string | null, ttlDays: number | undefined, mode: SyncMode): boolean {
  if (mode === 'full') return true
  if (mode === 'resume') return false
  if (!ttlDays) return false
  return daysSince(syncedAt) >= ttlDays
}

export class MarketDataSyncEngine {
  private serialThrottler: ApiThrottler
  private tushareThrottler: ApiThrottler | null = null
  private profileSettings = getSyncProfileSettings()
  private tushareBoost = isTushareEnabled() ? getTushareSyncBoost() : null
  /** finishJobEmpty 标记当前 job 为 intentional skip（非 ok） */
  private jobFinishedEmpty = false
  private quotesBatchDelayMs = getSyncProfileSettings().quotesBatchDelayMs

  constructor(
    private store: MarketDataStore,
    private de: AshareEngine,
    apiGapMs = DEFAULT_API_MIN_GAP_MS,
  ) {
    this.serialThrottler = new ApiThrottler(apiGapMs, 1)
  }

  async sync(options: SyncOptions = {}): Promise<{ jobs: Record<string, string> }> {
    const mode = options.mode ?? 'incremental'
    this.profileSettings = getSyncProfileSettings(options.profile)
    this.tushareBoost = isTushareEnabled() ? getTushareSyncBoost() : null
    this.quotesBatchDelayMs = this.profileSettings.quotesBatchDelayMs

    const safeGap = options.apiGapMs ?? this.profileSettings.apiGapMs
    this.serialThrottler = new ApiThrottler(safeGap, 1)

    if (this.tushareBoost) {
      this.tushareThrottler = new ApiThrottler(0, this.tushareBoost.maxConcurrent)
      this.quotesBatchDelayMs = Math.min(this.quotesBatchDelayMs, this.tushareBoost.quotesBatchDelayMs)
      options.onLog?.(
        `Tushare 加速 · ${this.tushareBoost.maxConcurrent} 路并行；东财/CNINFO 仍串行 ${safeGap}ms 间隔`,
      )
    } else {
      this.tushareThrottler = null
      options.onLog?.(`同步档位: ${this.profileSettings.label} · API 间隔 ${safeGap}ms`)
    }

    const jobs = options.jobs?.length ? options.jobs : [...BOOTSTRAP_SYNC_JOBS]
    if (options.force) {
      for (const job of jobs) {
        this.store.clearJobProgress(job)
        this.store.clearCursor(job)
      }
    } else {
      const cleared = this.store.clearBseJobErrors([...BOOTSTRAP_SYNC_JOBS])
      if (cleared > 0) {
        options.onLog?.(`北交所 ${cleared} 条历史失败已清除，将重新尝试`)
      }
    }

    const results: Record<string, string> = {}
    for (const [jobIndex, job] of jobs.entries()) {
      const minIntervalSkip = this.jobMinIntervalSkipReason(job, options)
      if (minIntervalSkip) {
        options.onJobStart?.(job, jobIndex, jobs.length)
        options.onLog?.(`跳过 ${job}（${minIntervalSkip}）`)
        results[job] = 'skipped'
        options.onJobFinish?.(job, 'skipped', jobIndex)
        continue
      }

      if (mode === 'incremental' && !this.shouldRunJobInIncremental(job, options)) {
        const ttl = SYNC_JOB_CONFIG[job]?.ttlDays
        options.onJobStart?.(job, jobIndex, jobs.length)
        options.onLog?.(`跳过 ${job}（${ttl ?? '?'} 天内已更新）`)
        results[job] = 'skipped'
        options.onJobFinish?.(job, 'skipped', jobIndex)
        continue
      }

      options.onJobStart?.(job, jobIndex, jobs.length)
      if (mode === 'resume') {
        const failed = this.store.countJobFailed(job)
        if (failed > 0) {
          options.onLog?.(`${job}: 跳过 ${failed} 只先前失败的标的（全量同步可重试）`)
        }
      }
      options.onLog?.(`开始任务 ${job}`)
      this.jobFinishedEmpty = false
      const runId = this.store.beginRun(job, mode)
      try {
        switch (job) {
          case 'universe':
          case 'initial_cn_universe':
            await this.syncInitialUniverseJob(runId, 'CN', job, options, mode)
            break
          case 'initial_hk_universe':
            await this.syncInitialUniverseJob(runId, 'HK', job, options, mode)
            break
          case 'initial_us_universe':
            await this.syncInitialUniverseJob(runId, 'US', job, options, mode)
            break
          case 'initial_cn_etf':
            await this.syncInitialCnEtfJob(runId, options, mode)
            break
          case 'initial_taxonomy':
            await this.syncInitialTaxonomyJob(runId, options, mode)
            break
          case 'quotes':
            await this.syncQuotes(runId, mode, options)
            break
          case 'kline_bootstrap':
            await this.syncKlineBootstrap(runId, mode, options)
            break
          case 'kline_daily':
            await this.syncKlineDaily(runId, mode, options)
            break
          case 'screen_factors':
            await this.syncScreenFactors(runId, mode, options)
            break
          case 'profiles':
            await this.syncProfiles(runId, mode, options)
            break
          case 'etf_list':
            await this.syncEtfList(runId, options, mode)
            break
          case 'etf_nav':
            await this.syncEtfNav(runId, mode, options)
            break
          case 'etf_holdings':
            await this.syncEtfHoldings(runId, mode, options)
            break
          case 'etf_kline_bootstrap':
            await this.syncEtfKlineBootstrap(runId, mode, options)
            break
          case 'us_list':
            await this.syncUsList(runId, options, mode)
            break
          case 'us_quotes':
            await this.syncUsQuotes(runId, mode, options)
            break
          case 'crypto_list':
            await this.syncCryptoList(runId, options, mode)
            break
          case 'crypto_quotes':
            await this.syncCryptoQuotes(runId, mode, options)
            break
          case 'hk_list':
          case 'jp_list':
          case 'kr_list':
            await this.syncRegionalList(runId, job, options, mode)
            break
          case 'hk_quotes':
          case 'jp_quotes':
          case 'kr_quotes':
            await this.syncRegionalQuotes(runId, job, options, mode)
            break
          case 'financials':
            await this.syncFinancials(runId, mode, options, 'annual')
            break
          case 'financials_quarterly':
            await this.syncFinancials(runId, mode, options, 'quarterly')
            break
          case 'business':
            await this.syncBusiness(runId, mode, options)
            break
          case 'partners':
            await this.syncPartners(runId, mode, options)
            break
          case 'announcements':
            await this.syncAnnouncements(runId, mode, options)
            break
          case 'dividends':
            await this.syncDividends(runId, mode, options)
            break
          case 'shareholders':
            await this.syncShareholders(runId, mode, options)
            break
          case 'forecasts':
            await this.syncForecasts(runId, mode, options)
            break
          case 'inst_holdings':
            await this.syncInstHoldings(runId, mode, options)
            break
          case 'insider_trades':
            await this.syncInsiderTrades(runId, mode, options)
            break
          case 'buybacks':
            await this.syncBuybacks(runId, mode, options)
            break
          case 'factors':
            await this.syncFactors(runId, mode, options)
            break
          case 'industry_stats':
            this.syncIndustryStats(runId, mode, options)
            break
          default:
            results[job] = 'skipped'
            options.onJobFinish?.(job, 'skipped', jobIndex)
            continue
        }
        results[job] = this.jobFinishedEmpty ? 'skipped' : 'ok'
        if (!this.jobFinishedEmpty) {
          this.store.setCursor(job)
          if ((STOCKINDEX_LIST_SYNC_JOBS as readonly string[]).includes(job)) {
            this.store.clearJobProgressErrors(job)
          }
        }
        options.onJobFinish?.(job, results[job], jobIndex)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        options.onLog?.(`任务 ${job} 失败：${msg}`)
        if (e instanceof Error && e.stack) {
          options.onLog?.(e.stack)
        }
        this.store.finishRun(runId, 'failed', { total: 0, success: 0, error: 1 }, msg)
        results[job] = `failed: ${msg}`
        options.onJobFinish?.(job, results[job], jobIndex)
      }
    }

    await this.finalizeDerivedData(options, mode, results)

    return { jobs: results }
  }

  private cfg(job: string, options: SyncOptions): JobSyncConfig {
    const base = { ...(SYNC_JOB_CONFIG[job] ?? { concurrency: 2, delayMs: 300 }) }
    const override = this.profileSettings.jobOverrides[job] ?? {}
    const tsOverride = this.tushareBoost && isTushareBackedSyncJob(job) && !EASTMONEY_HEAVY_JOBS.has(job)
      ? (this.tushareBoost.jobOverrides[job] ?? {})
      : {}
    return {
      ...base,
      ...override,
      ...tsOverride,
      concurrency: options.concurrency ?? tsOverride.concurrency ?? override.concurrency ?? base.concurrency,
      delayMs: options.delayMs ?? tsOverride.delayMs ?? override.delayMs ?? base.delayMs,
    }
  }

  private codes(options: SyncOptions): string[] {
    const all = this.store.listStockCodes(true)
    if (options.maxStocks && options.maxStocks > 0) return all.slice(0, options.maxStocks)
    return all
  }

  private usCodes(options: SyncOptions): string[] {
    const all = this.store.listUsCodes(true)
    if (options.maxStocks && options.maxStocks > 0) return all.slice(0, options.maxStocks)
    return all
  }

  private cryptoCodes(options: SyncOptions): string[] {
    const all = this.store.listCryptoCodes(true)
    if (options.maxStocks && options.maxStocks > 0) return all.slice(0, options.maxStocks)
    return all
  }

  private regionalCodes(market: 'JP' | 'KR' | 'HK', options: SyncOptions): string[] {
    const all = this.store.listRegionalCodes(market, true)
    if (options.maxStocks && options.maxStocks > 0) return all.slice(0, options.maxStocks)
    return all
  }

  private pendingRegionalCodes(
    job: string,
    market: 'JP' | 'KR' | 'HK',
    options: SyncOptions,
    mode: SyncMode,
    scopeKey: string,
    ttlDays?: number,
  ): string[] {
    const all = this.regionalCodes(market, options)
    return all.filter(code => {
      const errored = this.store.isJobError(job, code, scopeKey)
      if (mode === 'resume') {
        if (this.store.isJobDone(job, code, scopeKey)) return false
        if (errored) return false
        return true
      }
      if (mode === 'full') return true
      if (this.store.isJobDone(job, code, scopeKey)) {
        const syncedAt = this.store.jobProgressSyncedAt(job, code, scopeKey)
        if (shouldRefresh(syncedAt, ttlDays, mode)) return true
        return false
      }
      return true
    })
  }

  private pendingCryptoCodes(
    job: string,
    options: SyncOptions,
    mode: SyncMode,
    scopeKey: string,
    ttlDays?: number,
  ): string[] {
    const all = this.cryptoCodes(options)
    return all.filter(code => {
      const errored = this.store.isJobError(job, code, scopeKey)
      if (mode === 'resume') {
        if (this.store.isJobDone(job, code, scopeKey)) return false
        if (errored) return false
        return true
      }
      if (mode === 'full') return true
      if (this.store.isJobDone(job, code, scopeKey)) {
        const syncedAt = this.store.jobProgressSyncedAt(job, code, scopeKey)
        if (shouldRefresh(syncedAt, ttlDays, mode)) return true
        return false
      }
      return true
    })
  }

  private pendingUsCodes(
    job: string,
    options: SyncOptions,
    mode: SyncMode,
    scopeKey: string,
    ttlDays?: number,
  ): string[] {
    const all = this.usCodes(options)
    return all.filter(code => {
      const errored = this.store.isJobError(job, code, scopeKey)
      if (mode === 'resume') {
        if (this.store.isJobDone(job, code, scopeKey)) return false
        if (errored) return false
        return true
      }
      if (mode === 'full') return true
      if (this.store.isJobDone(job, code, scopeKey)) {
        const syncedAt = this.store.jobProgressSyncedAt(job, code, scopeKey)
        if (shouldRefresh(syncedAt, ttlDays, mode)) return true
        return false
      }
      return true
    })
  }

  private shouldRunJobInIncremental(job: string, options: SyncOptions = {}): boolean {
    if (this.jobMinIntervalSkipReason(job, options)) return false

    if (job === 'screen_factors' && this.store.screenFactorsStale()) return true
    if (job === 'industry_stats' && this.store.industryStatsStale()) return true

    const { is_ready: ready, last_sync: lastSync } = this.store.getStatus()
    if (ready) {
      if (job === 'initial_cn_universe') return cnUniverseMaintenanceDue(lastSync)
      if (job === 'initial_taxonomy') return cnTaxonomyMaintenanceDue(lastSync)
      if (job === 'kline_daily') return cnKlineDailyMaintenanceDue(lastSync)
    }

    const cfg = SYNC_JOB_CONFIG[job]
    if (!cfg?.ttlDays) return true
    const last = this.store.getCursorLastSuccess(job)
    if (!last) return true
    return daysSince(last) >= cfg.ttlDays
  }

  /** 名录/行业等 StockIndex 任务 — 距上次成功不足 minIntervalMinutes 则跳过（force 除外） */
  private jobMinIntervalSkipReason(job: string, options: SyncOptions): string | null {
    if (options.force) return null
    const minMinutes = SYNC_JOB_CONFIG[job]?.minIntervalMinutes
    if (!minMinutes || minMinutes <= 0) return null
    const last = this.store.getCursorLastSuccess(job)
    if (!last) return null
    const elapsed = minutesSince(last)
    if (elapsed >= minMinutes) return null
    const waited = Math.max(0, Math.round(elapsed))
    return `距上次同步 ${waited} 分钟，未满 ${minMinutes} 分钟，数据未过期`
  }

  /** K 线写入后于独立子进程批量重算离线筛选因子 */
  private async runScreenFactorsAfterKline(
    options: SyncOptions,
    jobName: 'kline_bootstrap' | 'kline_daily',
  ): Promise<void> {
    const gw = getMarketDuckGateway(this.store.klineDuckDbPath, this.store.dbPath)
    const stats = gw.klineStatsSync()
    if (!stats.rows) return

    const tradeDate = stats.maxDate ?? todayTradeDate()
    options.onLog?.(`日 K 已更新，子进程批量计算离线筛选因子（${tradeDate}）…`)
    options.onProgress?.({ job: jobName, current: 92, total: 100, message: '计算筛选因子…' })

    this.store.flushDuckWritesSync()
    try {
      const result = await gw.spawnComputeFactorsAsync({
        tradeDate,
        onProgress: (message, percent) => {
          options.onProgress?.({
            job: jobName,
            current: 90 + Math.round(percent * 0.1),
            total: 100,
            message,
          })
        },
      })
      if (result.computed > 0) {
        this.store.setCursor('screen_factors', {
          trade_date: tradeDate,
          success: result.computed,
          skipped: 0,
          source: jobName,
        })
        options.onLog?.(`离线筛选因子已更新：${result.computed.toLocaleString()} 只（${tradeDate}）`)
      } else {
        options.onLog?.('离线筛选因子：无可计算标的（跳过）')
      }
      this.store.flushDuckWritesSync()
      this.store.invalidateKlineStatsCache()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      options.onLog?.(`离线筛选因子计算失败（不影响 K 线导入）：${msg}`)
    }
  }

  private async finalizeDerivedData(
    options: SyncOptions,
    _mode: SyncMode,
    results: Record<string, string>,
  ): Promise<void> {
    this.store.flushDuckWritesSync()
    this.store.syncAnalyticsToDuck('all')

    const klineOk = (results.kline_bootstrap === 'ok' || results.kline_daily === 'ok')
    if (!klineOk && this.store.screenFactorsStale()) {
      const jobName = results.kline_daily === 'ok' ? 'kline_daily' : 'kline_bootstrap'
      await this.runScreenFactorsAfterKline(options, jobName)
    }
  }

  private finishJobEmpty(
    runId: number,
    job: string,
    options: SyncOptions,
    reason: string,
  ): void {
    this.jobFinishedEmpty = true
    options.onLog?.(`${job}: ${reason}`)
    this.store.finishRun(runId, 'success', { total: 0, success: 0, error: 0 })
  }

  private pendingCodes(
    job: string,
    options: SyncOptions,
    mode: SyncMode,
    scopeKey: string,
    ttlDays?: number,
    extraSkip?: (code: string) => boolean,
  ): string[] {
    const all = this.codes(options)
    return all.filter(code => {
      if (extraSkip?.(code)) return false
      const errored = this.store.isJobError(job, code, scopeKey)
      const bseRetry = errored && isBseCode(code)
      if (mode === 'resume') {
        if (this.store.isJobDone(job, code, scopeKey)) return false
        if (errored && !bseRetry) return false
        return true
      }
      if (mode === 'full') return true
      if (bseRetry) return true
      if (this.store.isJobDone(job, code, scopeKey)) {
        const syncedAt = this.store.jobProgressSyncedAt(job, code, scopeKey)
        if (shouldRefresh(syncedAt, ttlDays, mode)) return true
        return false
      }
      return true
    })
  }

  private useTushareLane(job: string): boolean {
    return this.tushareBoost != null
      && isTushareBackedSyncJob(job)
      && !EASTMONEY_HEAVY_JOBS.has(job)
  }

  private laneForJob(job: string): 'tushare' | 'default' {
    return this.useTushareLane(job) ? 'tushare' : 'default'
  }

  private laneTushareIfEnabled(): 'tushare' | 'default' {
    return this.tushareBoost ? 'tushare' : 'default'
  }

  private async callApi<T>(fn: () => Promise<T>, lane: 'tushare' | 'default' = 'default'): Promise<T> {
    const throttler = lane === 'tushare' && this.tushareThrottler
      ? this.tushareThrottler
      : this.serialThrottler
    const release = await throttler.acquire()
    try {
      return await withRetry(fn)
    } finally {
      release()
    }
  }

  private markDone(job: string, code: string, scopeKey: string): void {
    this.store.markJobProgress(job, code, scopeKey, 'done')
  }

  private markError(job: string, code: string, scopeKey: string): void {
    this.store.markJobProgress(job, code, scopeKey, 'error')
  }

  private cnSyncRef(code: string) {
    return cnRefFromCode(this.store, code)
  }

  private createGateway(options: SyncOptions): StandardInstrumentGateway {
    return new StandardInstrumentGateway(this.de, {
      onRetry: (attempt, error) => {
        options.onLog?.(`标准接口重试 ${attempt}：${error}`)
      },
    })
  }

  private initialCallbacks(job: string, options: SyncOptions): InitialSyncCallbacks {
    return {
      onLog: options.onLog,
      onProgress: (current, total, label) => {
        options.onProgress?.({ job, current, total, message: label })
      },
    }
  }

  private async syncInitialCnEtfJob(
    runId: number,
    options: SyncOptions,
    mode: SyncMode,
  ): Promise<void> {
    const job = 'initial_cn_etf'
    const cfg = this.cfg(job, options)
    if (mode === 'incremental' && cfg.ttlDays) {
      const last = this.store.getCursorLastSuccess(job)
      if (last && daysSince(last) < cfg.ttlDays) {
        this.finishJobEmpty(runId, job, options, 'ETF 名录在 TTL 内，跳过')
        return
      }
    }

    const result = await syncInitialCnEtf(this.store, cfg, this.initialCallbacks(job, options))
    this.store.finishRun(runId, 'success', {
      total: result.total,
      success: result.success,
      error: Math.max(0, result.total - result.success),
    })
    this.store.flushDuckWritesSync()
  }

  private async syncInitialUniverseJob(
    runId: number,
    market: InitialEquityMarket,
    job: string,
    options: SyncOptions,
    mode: SyncMode,
  ): Promise<void> {
    const cfg = this.cfg(job, options)
    if (mode === 'incremental' && cfg.ttlDays) {
      const last = this.store.getCursorLastSuccess(job)
      if (last && daysSince(last) < cfg.ttlDays) {
        this.finishJobEmpty(runId, job, options, `${market} 名录在 TTL 内，跳过`)
        return
      }
    }

    const callbacks = this.initialCallbacks(job, options)
    const result = await syncInitialStockIndexUniverse(
      this.store,
      market,
      job,
      cfg,
      callbacks,
    )
    if (result.total === 0 && result.success === 0 && (market === 'HK' || market === 'US')) {
      this.finishJobEmpty(runId, job, options, `${market} 名录暂无数据，已跳过`)
      return
    }
    this.store.finishRun(runId, 'success', {
      total: result.total,
      success: result.success,
      error: Math.max(0, result.total - result.success),
    })
    this.store.flushDuckWritesSync()
  }

  private async syncInitialTaxonomyJob(
    runId: number,
    options: SyncOptions,
    mode: SyncMode,
  ): Promise<void> {
    const job = 'initial_taxonomy'
    const cfg = this.cfg(job, options)
    if (mode === 'incremental' && cfg.ttlDays) {
      const last = this.store.getCursorLastSuccess(job)
      if (last && daysSince(last) < cfg.ttlDays) {
        this.finishJobEmpty(runId, job, options, '行业/板块在 TTL 内，跳过')
        return
      }
    }

    const result = await syncAllInitialTaxonomy(this.store, cfg, this.initialCallbacks(job, options))
    this.store.finishRun(runId, 'success', {
      total: result.nodes,
      success: result.nodes,
      error: 0,
    })
    this.store.flushDuckWritesSync()
  }

  private async syncUniverse(runId: number, options: SyncOptions, mode: SyncMode): Promise<void> {
    await this.syncInitialUniverseJob(runId, 'CN', 'universe', options, mode)
  }

  private etfCodes(options: SyncOptions): string[] {
    const all = this.store.listEtfCodes(true)
    if (options.maxStocks && options.maxStocks > 0) return all.slice(0, options.maxStocks)
    return all
  }

  private async syncEtfList(runId: number, options: SyncOptions, mode: SyncMode): Promise<void> {
    const cfg = this.cfg('etf_list', options)
    if (mode === 'incremental' && cfg.ttlDays) {
      const last = this.store.getCursorLastSuccess('etf_list')
      if (last && daysSince(last) < cfg.ttlDays) {
        this.finishJobEmpty(runId, 'etf_list', options, 'ETF 列表在 TTL 内，跳过')
        return
      }
    }

    const resp = await this.callApi(
      () => this.de.queryInstrumentData(cnEtfListRef(), 'etf_list') as Promise<QueryResult<StockListItem[]>>,
      'default',
    )
    if (!resp.success || !resp.data?.length) {
      throw new Error(resp.error ?? 'etfList failed')
    }

    let total = resp.data.length
    if (options.maxStocks) total = Math.min(total, options.maxStocks)
    let success = 0
    for (const [i, item] of resp.data.entries()) {
      if (options.maxStocks && i >= options.maxStocks) break
      const code = normalizeStockCode(String(item.code ?? ''))
      if (!code) continue
      this.store.upsertInstrument({
        code,
        market: 'CN',
        assetClass: 'ETF',
        name: String(item.name ?? ''),
        exchange: resolveMarket(code),
        status: 'active',
      })
      this.store.upsertEtfProfile(code, item as unknown as Record<string, unknown>)
      this.markDone('etf_list', code, '')
      success++
      if (i % 50 === 0) {
        options.onProgress?.({ job: 'etf_list', current: i + 1, total })
      }
    }
    options.onProgress?.({ job: 'etf_list', current: success, total })
    this.store.finishRun(runId, 'success', { total, success, error: total - success })
  }

  private async syncEtfNav(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('etf_nav', options)
    const codes = this.pendingEtfCodes('etf_nav', options, mode, '', cfg.ttlDays, code =>
      mode === 'incremental' && !shouldRefresh(this.store.etfNavSyncedAt(code), cfg.ttlDays, mode),
    )
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'etf_nav', options, 'ETF 净值均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0
    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'etf_nav', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(
          () => this.de.queryInstrumentData(cnEtfRef(code), 'etf_nav') as Promise<QueryResult<unknown[]>>,
          'default',
        )
        if (!resp.success || !resp.data?.length) throw new Error(resp.error ?? 'etfNav failed')
        const rows = resp.data.map(row => {
          const r = row as Record<string, unknown>
          return {
            date: String(r.date ?? ''),
            nav: typeof r.nav === 'number' ? r.nav : null,
            accNav: typeof r.accNav === 'number' ? r.accNav : null,
            changePct: typeof r.changePct === 'number' ? r.changePct : null,
            premiumRate: typeof r.premiumRate === 'number' ? r.premiumRate : null,
          }
        })
        this.store.replaceEtfNav(code, rows)
        this.markDone('etf_nav', code, '')
        success++
      } catch (e) {
        error++
        this.markError('etf_nav', code, '')
        this.store.logError(runId, 'etf_nav', code, e instanceof Error ? e.message : String(e))
      }
    })
    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncEtfHoldings(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('etf_holdings', options)
    const codes = this.pendingEtfCodes('etf_holdings', options, mode, '', cfg.ttlDays, code =>
      mode === 'incremental' && !shouldRefresh(this.store.etfHoldingsSyncedAt(code), cfg.ttlDays, mode),
    )
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'etf_holdings', options, 'ETF 持仓均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0
    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'etf_holdings', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(
          () => this.de.queryInstrumentData(cnEtfRef(code), 'etf_holdings') as Promise<QueryResult<unknown[]>>,
          'default',
        )
        if (!resp.success || !resp.data?.length) throw new Error(resp.error ?? 'etfHoldings failed')
        const rows = resp.data.map(row => {
          const r = row as Record<string, unknown>
          return {
            reportDate: String(r.reportDate ?? ''),
            holdingSymbol: String(r.holdingSymbol ?? ''),
            holdingName: r.holdingName != null ? String(r.holdingName) : null,
            weight: typeof r.weight === 'number' ? r.weight : null,
            shares: typeof r.shares === 'number' ? r.shares : null,
            marketValue: typeof r.marketValue === 'number' ? r.marketValue : null,
          }
        })
        this.store.replaceEtfHoldings(code, rows)
        this.markDone('etf_holdings', code, '')
        success++
      } catch (e) {
        error++
        this.markError('etf_holdings', code, '')
        this.store.logError(runId, 'etf_holdings', code, e instanceof Error ? e.message : String(e))
      }
    })
    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncEtfKlineBootstrap(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('etf_kline_bootstrap', options)
    const codes = this.pendingEtfCodes('etf_kline_bootstrap', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'etf_kline_bootstrap', options, 'ETF K 线均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0
    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'etf_kline_bootstrap', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(
          () => this.de.kline(code, KLINE_BOOTSTRAP_DAYS),
          'default',
        )
        if (!resp.success || !resp.data?.length) throw new Error(resp.error ?? 'kline failed')
        const bars = resp.data.map(bar => ({
          tradeDate: String(bar.date ?? '').slice(0, 10),
          code: normalizeStockCode(code),
          open: bar.open ?? null,
          high: bar.high ?? null,
          low: bar.low ?? null,
          close: bar.close ?? null,
          volume: bar.volume ?? null,
          amount: bar.amount ?? null,
          changePct: bar.changePct ?? null,
        })).filter(b => b.tradeDate)
        if (bars.length) this.store.bulkUpsertKlines(bars)
        this.markDone('etf_kline_bootstrap', code, '')
        success++
      } catch (e) {
        error++
        this.markError('etf_kline_bootstrap', code, '')
        this.store.logError(runId, 'etf_kline_bootstrap', code, e instanceof Error ? e.message : String(e))
      }
    })
    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncUsList(runId: number, options: SyncOptions, _mode: SyncMode): Promise<void> {
    this.finishJobEmpty(runId, 'us_list', options, '跨市场名录已改 StockIndex 在线检索，跳过 us_list')
  }

  private async syncUsQuotes(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('us_quotes', options)
    const tradeDate = usTodayString()
    const universe = this.usCodes(options)
    const codes = this.pendingUsCodes('us_quotes', options, mode, tradeDate, cfg.ttlDays)

    if (codes.length === 0) {
      const hint = universe.length === 0
        ? '尚无美股列表，请先准备美股数据包'
        : '今日美股截面已齐，跳过'
      this.finishJobEmpty(runId, 'us_quotes', options, hint)
      return
    }

    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'us_quotes', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(
          () => deRealtimeQuery(this.de, equityInstrumentRef('US', code)),
          'default',
        )
        if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'queryInstrumentData failed')
        this.store.upsertQuoteDaily(tradeDate, code, resp.data[0] as unknown as Record<string, unknown>)
        this.markDone('us_quotes', code, tradeDate)
        success++
      } catch (e) {
        error++
        this.markError('us_quotes', code, tradeDate)
        this.store.logError(runId, 'us_quotes', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncCryptoList(runId: number, options: SyncOptions, _mode: SyncMode): Promise<void> {
    this.finishJobEmpty(runId, 'crypto_list', options, '跨市场名录已改在线检索，跳过 crypto_list')
  }

  /** HK/JP/KR list sync — 已停用，改用 StockIndex / 在线 Provider */
  private async syncRegionalList(
    runId: number,
    job: string,
    options: SyncOptions,
    _mode: SyncMode,
  ): Promise<void> {
    this.finishJobEmpty(runId, job, options, `${job} 名录同步已停用，请使用在线搜索`)
  }

  /** HK/JP/KR quotes — requires a registered regional provider (no free scraper registered). */
  private async syncRegionalQuotes(
    runId: number,
    job: string,
    options: SyncOptions,
    mode: SyncMode,
  ): Promise<void> {
    if (!isRegionalQuotesJob(job)) {
      throw new Error(`未知区域行情任务: ${job}`)
    }
    const market = regionalQuotesJobMarket(job)!
    const cfg = this.cfg(job, options)
    if (!isRegionalTradingDay(market)) {
      this.finishJobEmpty(runId, job, options, `${market} 今日休市，跳过 ${job}`)
      return
    }
    const tradeDate = regionalTodayString(market)
    const universe = this.regionalCodes(market, options)
    const codes = this.pendingRegionalCodes(job, market, options, mode, tradeDate, cfg.ttlDays)

    if (codes.length === 0) {
      const hint = universe.length === 0
        ? `尚无 ${market} 列表，请先准备 ${market} 数据包`
        : `今日 ${market} 截面已齐，跳过`
      this.finishJobEmpty(runId, job, options, hint)
      return
    }

    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job, current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(
          () => deRealtimeQuery(this.de, equityInstrumentRef(market, code)),
          'default',
        )
        if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'queryInstrumentData failed')
        this.store.upsertQuoteDaily(tradeDate, code, resp.data[0] as unknown as Record<string, unknown>)
        this.markDone(job, code, tradeDate)
        success++
      } catch (e) {
        error++
        this.markError(job, code, tradeDate)
        this.store.logError(runId, job, code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncCryptoQuotes(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('crypto_quotes', options)
    const tradeDate = new Date().toISOString().slice(0, 10)
    const universe = this.cryptoCodes(options)
    const codes = this.pendingCryptoCodes('crypto_quotes', options, mode, tradeDate, cfg.ttlDays)

    if (codes.length === 0) {
      const hint = universe.length === 0
        ? '尚无 Crypto 列表，请先准备 Crypto 数据包'
        : '今日 Crypto 截面已齐，跳过'
      this.finishJobEmpty(runId, 'crypto_quotes', options, hint)
      return
    }

    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'crypto_quotes', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(
          () => deRealtimeQuery(this.de, cryptoInstrumentRef(code)),
          'default',
        )
        if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'queryInstrumentData failed')
        this.store.upsertQuoteDaily(tradeDate, code, resp.data[0] as unknown as Record<string, unknown>)
        this.markDone('crypto_quotes', code, tradeDate)
        success++
      } catch (e) {
        error++
        this.markError('crypto_quotes', code, tradeDate)
        this.store.logError(runId, 'crypto_quotes', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private pendingEtfCodes(
    job: string,
    options: SyncOptions,
    mode: SyncMode,
    scopeKey: string,
    ttlDays?: number,
    extraSkip?: (code: string) => boolean,
  ): string[] {
    const all = this.etfCodes(options)
    return all.filter(code => {
      if (extraSkip?.(code)) return false
      const errored = this.store.isJobError(job, code, scopeKey)
      if (mode === 'resume') {
        if (this.store.isJobDone(job, code, scopeKey)) return false
        if (errored) return false
        return true
      }
      if (mode === 'full') return true
      if (this.store.isJobDone(job, code, scopeKey) && ttlDays) {
        const last = this.store.getCursorLastSuccess(job)
        if (last && daysSince(last) < ttlDays) return false
      }
      return true
    })
  }

  private async syncQuotes(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('quotes', options)
    const tradeDate = todayTradeDate()
    const codes = this.pendingCodes('quotes', options, mode, tradeDate, cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'quotes', options, '今日截面已齐，跳过')
      return
    }
    let success = 0
    let error = 0

    for (let offset = 0; offset < codes.length; offset += this.profileSettings.quotesBatchSize) {
      const chunk = codes.slice(offset, offset + this.profileSettings.quotesBatchSize)
      options.onProgress?.({
        job: 'quotes',
        current: Math.min(offset + chunk.length, codes.length),
        total: codes.length,
      })

      try {
        const resp = await this.callApi(
          () => this.de.batchRealtime(chunk),
          this.laneTushareIfEnabled(),
        )
        if (!resp.success || !resp.data?.length) throw new Error(resp.error ?? 'batchRealtime failed')
        const seen = new Set<string>()
        for (const q of resp.data) {
          const code = normalizeStockCode(String(q.code ?? ''))
          if (!code) continue
          seen.add(code)
          this.store.upsertQuoteDaily(tradeDate, code, q as unknown as Record<string, unknown>)
          this.markDone('quotes', code, tradeDate)
          success++
        }
        const missing = chunk.filter(code => !seen.has(code))
        if (missing.length) {
          await mapPool(missing, cfg.concurrency, cfg.delayMs, async code => {
            try {
              const single = await this.callApi(
                () => this.de.queryInstrumentData(this.cnSyncRef(code), 'realtime') as Promise<QueryResult<StockRealtime[]>>,
                'default',
              )
              if (!single.success || !single.data?.[0]) throw new Error(single.error ?? 'realtime failed')
              this.store.upsertQuoteDaily(tradeDate, code, single.data[0] as unknown as Record<string, unknown>)
              this.markDone('quotes', code, tradeDate)
              success++
            } catch (e) {
              error++
              this.markError('quotes', code, tradeDate)
              this.store.logError(runId, 'quotes', code, e instanceof Error ? e.message : String(e))
            }
          })
        }
      } catch {
        await mapPool(chunk, cfg.concurrency, cfg.delayMs, async code => {
          try {
            const resp = await this.callApi(
              () => this.de.queryInstrumentData(this.cnSyncRef(code), 'realtime') as Promise<QueryResult<StockRealtime[]>>,
              'default',
            )
            if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'realtime failed')
            this.store.upsertQuoteDaily(tradeDate, code, resp.data[0] as unknown as Record<string, unknown>)
            this.markDone('quotes', code, tradeDate)
            success++
          } catch (e) {
            error++
            this.markError('quotes', code, tradeDate)
            this.store.logError(runId, 'quotes', code, e instanceof Error ? e.message : String(e))
          }
        })
      }

      if (offset + this.profileSettings.quotesBatchSize < codes.length) {
        await sleep(this.quotesBatchDelayMs)
      }
    }

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
    this.store.flushDuckWritesSync()
  }

  private async syncProfiles(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('profiles', options)
    const codes = this.pendingCodes('profiles', options, mode, '', cfg.ttlDays, code =>
      mode === 'incremental' && !shouldRefresh(this.store.profileSyncedAt(code), cfg.ttlDays, mode),
    )
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'profiles', options, '档案均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'profiles', current: index + 1, total: codes.length })
      try {
        const ref = this.cnSyncRef(code)
        const resp = await this.callApi(
          () => this.de.queryInstrumentData(ref, 'profile') as Promise<QueryResult<StockProfile[]>>,
          this.laneForJob('profiles'),
        )
        if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'profile failed')
        const p = resp.data[0]
        this.store.replaceProfile(code, p as unknown as Record<string, unknown>)
        this.store.upsertStock({
          code,
          name: p.name ?? code,
          market: ref.exchange ?? undefined,
          industry: p.industry,
          industry_csrc: p.industryCsrc,
          listing_date: p.listingDate,
          is_st: detectSt(p.name ?? code),
        })
        this.markDone('profiles', code, '')
        success++
      } catch (e) {
        error++
        this.markError('profiles', code, '')
        this.store.logError(runId, 'profiles', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncFinancials(
    runId: number,
    mode: SyncMode,
    options: SyncOptions,
    kind: 'annual' | 'quarterly',
  ): Promise<void> {
    const job = kind === 'quarterly' ? 'financials_quarterly' : 'financials'
    const cfg = this.cfg(job, options)
    const codes = this.pendingCodes(job, options, mode, kind, cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, job, options, '财务数据均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job, current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(
          () => kind === 'quarterly' ? this.de.financialsQuarterly(code) : this.de.financials(code),
          this.laneForJob(job),
        )
        if (!resp.success || !resp.data?.length) throw new Error(resp.error ?? 'financials failed')
        for (const row of resp.data) {
          this.store.replaceFinancial(code, row as unknown as Record<string, unknown>)
        }
        this.markDone(job, code, kind)
        success++
      } catch (e) {
        error++
        this.markError(job, code, kind)
        this.store.logError(runId, job, code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncBusiness(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('business', options)
    const codes = this.pendingCodes('business', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'business', options, '业务分部均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'business', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(() => this.de.mainBusiness(code), this.laneForJob('business'))
        if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'mainBusiness failed')
        const row = resp.data[0] as Record<string, unknown>
        const items = (row.items as Record<string, unknown>[] | undefined) ?? []
        const reportDate = String(row.reportDate ?? todayTradeDate())
        if (items.length) this.store.replaceBusinessSegments(code, reportDate, items)
        this.markDone('business', code, '')
        success++
      } catch (e) {
        error++
        this.markError('business', code, '')
        this.store.logError(runId, 'business', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncPartners(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('partners', options)
    const codes = this.pendingCodes('partners', options, mode, '', cfg.ttlDays, code =>
      mode === 'incremental' && !shouldRefresh(this.store.partnerSyncedAt(code), cfg.ttlDays, mode),
    )
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'partners', options, '客户/供应商均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'partners', current: index + 1, total: codes.length })
      try {
        const cust = await this.callApi(() => this.de.topCustomerSupplier(code, 'customer'), 'default')
        const supp = await this.callApi(() => this.de.topCustomerSupplier(code, 'supplier'), 'default')
        if (cust.success && cust.data?.length) {
          this.store.replacePartners(code, 'customer', cust.data as Record<string, unknown>[])
        }
        if (supp.success && supp.data?.length) {
          this.store.replacePartners(code, 'supplier', supp.data as Record<string, unknown>[])
        }
        this.markDone('partners', code, '')
        success++
      } catch (e) {
        error++
        this.markError('partners', code, '')
        this.store.logError(runId, 'partners', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncAnnouncements(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('announcements', options)
    const scopeKey = todayTradeDate()
    const codes = this.pendingCodes('announcements', options, mode, scopeKey, cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'announcements', options, '今日公告已拉取，跳过')
      return
    }
    const pages = cfg.pages ?? 2
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'announcements', current: index + 1, total: codes.length })
      try {
        const all: Record<string, unknown>[] = []
        for (let page = 1; page <= pages; page++) {
          const resp = await this.callApi(() => this.de.news(code, page, 30), 'default')
          if (resp.success && resp.data?.length) all.push(...(resp.data as unknown as Record<string, unknown>[]))
          if (!resp.data?.length || resp.data.length < 30) break
        }
        if (all.length) this.store.replaceAnnouncements(code, all)
        this.markDone('announcements', code, scopeKey)
        success++
      } catch (e) {
        error++
        this.markError('announcements', code, scopeKey)
        this.store.logError(runId, 'announcements', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncDividends(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('dividends', options)
    const codes = this.pendingCodes('dividends', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'dividends', options, '分红均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'dividends', current: index + 1, total: codes.length })
      try {
        const wiredCode = cnLegacyProviderCode(this.cnSyncRef(code))
        const resp = await this.callApi(() => this.de.dividend(wiredCode), this.laneForJob('dividends'))
        if (resp.success && resp.data?.length) {
          this.store.replaceDividends(code, resp.data as unknown as Record<string, unknown>[])
        }
        this.markDone('dividends', code, '')
        success++
      } catch (e) {
        error++
        this.markError('dividends', code, '')
        this.store.logError(runId, 'dividends', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncShareholders(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('shareholders', options)
    const codes = this.pendingCodes('shareholders', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'shareholders', options, '股东均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'shareholders', current: index + 1, total: codes.length })
      try {
        const wiredCode = cnLegacyProviderCode(this.cnSyncRef(code))
        const resp = await this.callApi(() => this.de.shareholders(wiredCode), this.laneForJob('shareholders'))
        if (resp.success && resp.data?.[0]) {
          this.store.replaceShareholders(code, resp.data[0] as Record<string, unknown>)
        }
        this.markDone('shareholders', code, '')
        success++
      } catch (e) {
        error++
        this.markError('shareholders', code, '')
        this.store.logError(runId, 'shareholders', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncForecasts(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('forecasts', options)
    const codes = this.pendingCodes('forecasts', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'forecasts', options, '业绩预告均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'forecasts', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(() => this.de.perfForecast(code), this.laneForJob('forecasts'))
        if (resp.success && resp.data?.length) {
          this.store.replaceForecasts(code, resp.data as Record<string, unknown>[])
        }
        this.markDone('forecasts', code, '')
        success++
      } catch (e) {
        error++
        this.markError('forecasts', code, '')
        this.store.logError(runId, 'forecasts', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncInstHoldings(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('inst_holdings', options)
    const codes = this.pendingCodes('inst_holdings', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'inst_holdings', options, '机构持仓均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'inst_holdings', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(() => this.de.instHolding(code), this.laneForJob('inst_holdings'))
        if (resp.success && resp.data?.length) {
          this.store.replaceInstHoldings(code, resp.data as Record<string, unknown>[])
        }
        this.markDone('inst_holdings', code, '')
        success++
      } catch (e) {
        error++
        this.markError('inst_holdings', code, '')
        this.store.logError(runId, 'inst_holdings', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncInsiderTrades(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('insider_trades', options)
    const codes = this.pendingCodes('insider_trades', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'insider_trades', options, '增减持均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'insider_trades', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(() => this.de.insiderTrade(code), this.laneForJob('insider_trades'))
        if (resp.success && resp.data?.length) {
          this.store.replaceInsiderTrades(code, resp.data as Record<string, unknown>[])
        }
        this.markDone('insider_trades', code, '')
        success++
      } catch (e) {
        error++
        this.markError('insider_trades', code, '')
        this.store.logError(runId, 'insider_trades', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private async syncBuybacks(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('buybacks', options)
    const codes = this.pendingCodes('buybacks', options, mode, '', cfg.ttlDays)
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'buybacks', options, '回购均在 TTL 内，跳过')
      return
    }
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'buybacks', current: index + 1, total: codes.length })
      try {
        const resp = await this.callApi(() => this.de.buyback(code), this.laneForJob('buybacks'))
        if (resp.success && resp.data?.length) {
          this.store.replaceBuybacks(code, resp.data as Record<string, unknown>[])
        }
        this.markDone('buybacks', code, '')
        success++
      } catch (e) {
        error++
        this.markError('buybacks', code, '')
        this.store.logError(runId, 'buybacks', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private klinePendingFilter(
    job: string,
    options: SyncOptions,
    mode: SyncMode,
    scopeKey: string,
    ttlDays?: number,
  ): (market: InitialEquityMarket, code: string) => boolean {
    return (market, code) => {
      const scoped = `${market}:${code}`
      if (market === 'CN') {
        return this.pendingCodes(job, options, mode, scopeKey, ttlDays).includes(code)
      }
      const errored = this.store.isJobError(job, scoped, scopeKey)
      if (mode === 'resume') {
        if (this.store.isJobDone(job, scoped, scopeKey)) return false
        if (errored) return false
        return true
      }
      if (mode === 'full') return true
      if (this.store.isJobDone(job, scoped, scopeKey)) {
        const syncedAt = this.store.jobProgressSyncedAt(job, scoped, scopeKey)
        return shouldRefresh(syncedAt, ttlDays, mode)
      }
      return true
    }
  }

  private async importCnKlineDumpFromThs(
    runId: number,
    jobName: 'kline_bootstrap' | 'kline_daily',
    dumpType: 'full' | 'incremental',
    options: SyncOptions,
  ): Promise<number> {
    const cfg = loadTonghuashunConfig()
    if (!isTonghuashunEnabled(cfg)) {
      throw new Error('同花顺未启用或 API Key 未配置，无法导入 A 股 K 线数据包')
    }

    const client = FuyaoClient.fromConfig()
    if (!client) {
      throw new Error('无法创建同花顺客户端')
    }

    const label = dumpType === 'full' ? '全量（10年）' : '增量（10天）'
    options.onLog?.(`导入同花顺 A 股日 K ${label} Parquet 数据包…`)

    const reportPhase = (message: string, current: number) => {
      options.onProgress?.({ job: jobName, current, total: 100, message })
    }

    reportPhase('准备导入…', 0)

    const klineResult = await importDailyKDump(this.store, dumpType, client.get.bind(client), {
      onPhase: (phase, percent) => reportPhase(phase, percent),
    })

    if (!klineResult.success) {
      throw new Error(klineResult.error ?? '同花顺 K 线数据包导入失败')
    }

    if (klineResult.rowsImported === 0) {
      this.finishJobEmpty(runId, jobName, options, '数据包无新 K 线，跳过')
      return 0
    }

    this.store.repairBootstrapJobProgress()
    this.store.setCursor(jobName, { dumpType, rowsImported: klineResult.rowsImported })
    this.store.setCursor('dump_import', { dumpType, rowsImported: klineResult.rowsImported })
    if (dumpType === 'full') {
      // 全量包已含近期日 K，同步标记日 K 维护位避免 UI 重复显示未完成
      this.store.setCursor('kline_daily', {
        dumpType: 'full',
        rowsImported: klineResult.rowsImported,
        source: 'kline_bootstrap',
      })
    }

    options.onLog?.(`同花顺 K 线数据包导入完成：${klineResult.rowsImported.toLocaleString()} 条`)
    reportPhase(`已导入 ${klineResult.rowsImported.toLocaleString()} 条`, 90)

    await this.runScreenFactorsAfterKline(options, jobName)
    reportPhase('因子计算完成', 100)

    this.store.finishRun(runId, 'success', {
      total: klineResult.rowsImported,
      success: klineResult.rowsImported,
      error: 0,
    })
    return klineResult.rowsImported
  }

  private async syncKlineBootstrap(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('kline_bootstrap', options)
    if (mode === 'incremental' && cfg.ttlDays && !options.force) {
      const last = this.store.getCursorLastSuccess('kline_bootstrap')
      if (last && daysSince(last) < cfg.ttlDays && this.store.hasKlineData()) {
        this.finishJobEmpty(runId, 'kline_bootstrap', options, '历史 K 线数据包在 TTL 内，跳过')
        return
      }
    }

    await this.importCnKlineDumpFromThs(runId, 'kline_bootstrap', 'full', options)
  }

  private async syncKlineDaily(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('kline_daily', options)
    if (mode === 'incremental' && cfg.ttlDays && !options.force) {
      const last = this.store.getCursorLastSuccess('kline_daily')
      if (last && daysSince(last) < cfg.ttlDays) {
        this.finishJobEmpty(runId, 'kline_daily', options, '日 K 数据包在 TTL 内，跳过')
        return
      }
    }

    await this.importCnKlineDumpFromThs(runId, 'kline_daily', 'incremental', options)
  }

  private async syncBseKlineSupplement(
    _runId: number,
    options: SyncOptions,
    _cfg: JobSyncConfig,
  ): Promise<void> {
    const bseCodes = this.store.listBseCodesNeedingKlines(60)
    if (!bseCodes.length) return
    options.onLog?.(`北交所 K 线补全跳过（${bseCodes.length} 只）— 需配置合规数据源`)
  }

  private syncScreenFactors(
    runId: number,
    mode: SyncMode,
    options: SyncOptions,
    forceRecalc = false,
  ): Promise<void> {
    const tradeDate = todayTradeDate()
    const all = this.codes(options)
    const codes = forceRecalc
      ? all
      : (mode === 'resume'
        ? all.filter(code => !this.store.isJobDone('screen_factors', code, tradeDate))
        : all.filter(code =>
          mode !== 'incremental' || !this.store.hasFactorsForDate(code, tradeDate),
        ))

    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'screen_factors', options, '今日初选因子已齐，跳过')
      return Promise.resolve()
    }

    options.onLog?.(`本地计算初选因子 · ${codes.length} 只${forceRecalc ? '（全量重算）' : ''}`)
    const { success, skipped } = runLocalScreenFactors(this.store, tradeDate, codes)
    this.store.setCursor('screen_factors', { trade_date: tradeDate, success, skipped, force: forceRecalc })
    this.store.finishRun(runId, skipped > 0 ? 'partial' : 'success', {
      total: codes.length,
      success,
      error: skipped,
    })
    this.store.flushDuckWritesSync()
    return Promise.resolve()
  }

  private async syncFactors(runId: number, mode: SyncMode, options: SyncOptions): Promise<void> {
    const cfg = this.cfg('factors', options)
    const tradeDate = todayTradeDate()
    const codes = this.pendingCodes(
      'factors',
      options,
      mode,
      tradeDate,
      undefined,
      code => mode === 'incremental' && this.store.hasFactorsForDate(code, tradeDate),
    )
    if (codes.length === 0) {
      this.finishJobEmpty(runId, 'factors', options, '今日因子已齐，跳过')
      return
    }
    const card = createScorecard('综合评估')
    let success = 0
    let error = 0

    await mapPool(codes, cfg.concurrency, cfg.delayMs, async (code, index) => {
      options.onProgress?.({ job: 'factors', current: index + 1, total: codes.length })
      try {
        const cachingDe = new SyncCachingEngine(this.de)
        const ee = new EvaluationEngine(cachingDe as unknown as AshareEngine)
        const snap = await this.callApi(() => ee.analyze(code), 'default')
        card.score([snap])
        const factors = Object.fromEntries(
          Object.entries(snap.factors).map(([k, v]) => [k, v?.value ?? null]),
        )
        this.store.replaceFactors(tradeDate, code, factors)
        this.store.upsertScore(tradeDate, code, '综合评估', snap.totalScore ?? null)
        this.markDone('factors', code, tradeDate)
        success++
      } catch (e) {
        error++
        this.markError('factors', code, tradeDate)
        this.store.logError(runId, 'factors', code, e instanceof Error ? e.message : String(e))
      }
    })

    this.store.finishRun(runId, error ? 'partial' : 'success', {
      total: codes.length,
      success,
      error,
    })
  }

  private syncIndustryStats(
    runId: number,
    mode: SyncMode,
    options: SyncOptions,
    force = false,
  ): void {
    const cfg = SYNC_JOB_CONFIG.industry_stats
    if (!force && mode === 'incremental' && cfg.ttlDays) {
      const last = this.store.getCursorLastSuccess('industry_stats')
      if (last && daysSince(last) < cfg.ttlDays && !this.store.industryStatsStale()) {
        this.finishJobEmpty(runId, 'industry_stats', options, '行业统计今日已重建，跳过')
        return
      }
    }
    const tradeDate = todayTradeDate()
    const n = this.store.rebuildIndustryStats(tradeDate)
    const activeCodes = this.codes({})
    if (activeCodes.length) {
      this.store.markBootstrapJobDoneForCodes('industry_stats', activeCodes, tradeDate)
    }
    this.store.setCursor('industry_stats', { trade_date: tradeDate, industries: n })
    this.store.finishRun(runId, 'success', { total: n, success: n, error: 0 })
  }

  /** @deprecated 请通过 sync job `kline_bootstrap` / `kline_daily` 导入同花顺 Parquet 数据包 */
  async importDump(options: SyncOptions = {}): Promise<{
    success: boolean
    klineResult?: { type: string; rowsImported: number; error?: string }
  }> {
    const dumpType = this.store.hasKlineData() ? 'incremental' : 'full'
    const runId = this.store.beginRun('dump_import', 'incremental')
    try {
      const rowsImported = await this.importCnKlineDumpFromThs(runId, 'kline_daily', dumpType, options)
      return {
        success: true,
        klineResult: { type: dumpType, rowsImported },
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.store.finishRun(runId, 'failed', { total: 0, success: 0, error: 1 }, msg)
      options.onLog?.(msg)
      return { success: false, klineResult: { type: dumpType, rowsImported: 0, error: msg } }
    }
  }
}
