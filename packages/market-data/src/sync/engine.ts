import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import { isTushareEnabled } from '@inno-a-stock/a-stock-layer'
import { createScorecard } from '@inno-a-stock/stock-eval'
import { EvaluationEngine } from '@inno-a-stock/stock-eval'
import type { MarketDataStore } from '../store.js'
import { daysSince, detectSt, normalizeStockCode, todayTradeDate } from '../utils.js'
import { SyncCachingEngine } from './cache-engine.js'
import {
  DEFAULT_API_MIN_GAP_MS,
  EASTMONEY_HEAVY_JOBS,
  getSyncProfileSettings,
  getTushareSyncBoost,
  isTushareBackedSyncJob,
  type JobSyncConfig,
  type SyncSpeedProfile,
  SYNC_JOB_CONFIG,
} from './config.js'
import { mapPool, sleep, withRetry } from './pool.js'
import { ApiThrottler } from './throttle.js'

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
  concurrency?: number
  delayMs?: number
  apiGapMs?: number
  /** safe | balanced | fast — default balanced, override via INNO_MARKET_SYNC_PROFILE */
  profile?: SyncSpeedProfile | string
  maxStocks?: number
  force?: boolean
  background?: boolean
  onProgress?: (p: SyncProgress) => void
  onJobStart?: (job: string, index: number, total: number) => void
  onJobFinish?: (job: string, status: string, index: number) => void
  onLog?: (message: string) => void
}

export const ALL_SYNC_JOBS = [
  'universe',
  'quotes',
  'profiles',
  'financials',
  'financials_quarterly',
  'business',
  'partners',
  'announcements',
  'dividends',
  'shareholders',
  'forecasts',
  'inst_holdings',
  'insider_trades',
  'buybacks',
  'factors',
  'industry_stats',
] as const

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

    const jobs = options.jobs?.length ? options.jobs : [...ALL_SYNC_JOBS]
    if (options.force) {
      for (const job of jobs) this.store.clearJobProgress(job)
    }

    const results: Record<string, string> = {}
    for (const [jobIndex, job] of jobs.entries()) {
      if (mode === 'incremental' && !this.shouldRunJobInIncremental(job)) {
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
      const runId = this.store.beginRun(job, mode)
      try {
        switch (job) {
          case 'universe':
            await this.syncUniverse(runId, options, mode)
            break
          case 'quotes':
            await this.syncQuotes(runId, mode, options)
            break
          case 'profiles':
            await this.syncProfiles(runId, mode, options)
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
        results[job] = 'ok'
        this.store.setCursor(job)
        options.onJobFinish?.(job, results[job], jobIndex)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.store.finishRun(runId, 'failed', { total: 0, success: 0, error: 1 }, msg)
        results[job] = `failed: ${msg}`
        options.onJobFinish?.(job, results[job], jobIndex)
      }
    }
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

  private shouldRunJobInIncremental(job: string): boolean {
    const cfg = SYNC_JOB_CONFIG[job]
    if (!cfg?.ttlDays) return true
    const last = this.store.getCursorLastSuccess(job)
    if (!last) return true
    return daysSince(last) >= cfg.ttlDays
  }

  private finishJobEmpty(
    runId: number,
    job: string,
    options: SyncOptions,
    reason: string,
  ): void {
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
      if (mode === 'resume') {
        if (this.store.isJobDone(job, code, scopeKey)) return false
        // Skip prior failures on resume — retry only via full sync or clearing job progress.
        if (this.store.isJobError(job, code, scopeKey)) return false
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

  private async syncUniverse(runId: number, options: SyncOptions, mode: SyncMode): Promise<void> {
    const cfg = this.cfg('universe', options)
    if (mode === 'incremental' && cfg.ttlDays) {
      const last = this.store.getCursorLastSuccess('universe')
      if (last && daysSince(last) < cfg.ttlDays) {
        this.finishJobEmpty(runId, 'universe', options, '股票池在 TTL 内，跳过')
        return
      }
    }

    const resp = await this.callApi(() => this.de.stockList(), this.laneTushareIfEnabled())
    if (!resp.success || !resp.data?.length) {
      throw new Error(resp.error ?? 'stockList failed')
    }
    let total = resp.data.length
    if (options.maxStocks) total = Math.min(total, options.maxStocks)
    let success = 0
    for (const [i, item] of resp.data.entries()) {
      if (options.maxStocks && i >= options.maxStocks) break
      const code = normalizeStockCode(item.code)
      this.store.upsertStock({
        code,
        name: item.name,
        market: item.market,
        industry: item.industry,
        is_st: detectSt(item.name),
        status: detectSt(item.name) ? 'st' : 'active',
      })
      this.markDone('universe', code, '')
      success++
    }
    this.store.finishRun(runId, 'success', { total, success, error: total - success })
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
        for (const code of chunk) {
          if (!seen.has(code)) {
            error++
            this.markError('quotes', code, tradeDate)
            this.store.logError(runId, 'quotes', code, 'missing from batchRealtime response')
          }
        }
      } catch {
        await mapPool(chunk, cfg.concurrency, cfg.delayMs, async code => {
          try {
            const resp = await this.callApi(() => this.de.realtime(code), 'default')
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
        const resp = await this.callApi(() => this.de.profile(code), this.laneForJob('profiles'))
        if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'profile failed')
        const p = resp.data[0]
        this.store.replaceProfile(code, p as unknown as Record<string, unknown>)
        this.store.upsertStock({
          code,
          name: p.name ?? code,
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
        if (!resp.success || !resp.data?.[0]) throw new Error(resp.error ?? 'financials failed')
        this.store.replaceFinancial(code, resp.data[0] as unknown as Record<string, unknown>)
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
        const resp = await this.callApi(() => this.de.dividend(code), this.laneForJob('dividends'))
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
        const resp = await this.callApi(() => this.de.shareholders(code), this.laneForJob('shareholders'))
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

  private syncIndustryStats(runId: number, mode: SyncMode, options: SyncOptions): void {
    const cfg = SYNC_JOB_CONFIG.industry_stats
    if (mode === 'incremental' && cfg.ttlDays) {
      const last = this.store.getCursorLastSuccess('industry_stats')
      if (last && daysSince(last) < cfg.ttlDays) {
        this.finishJobEmpty(runId, 'industry_stats', options, '行业统计今日已重建，跳过')
        return
      }
    }
    const tradeDate = todayTradeDate()
    const n = this.store.rebuildIndustryStats(tradeDate)
    this.store.finishRun(runId, 'success', { total: n, success: n, error: 0 })
  }
}
