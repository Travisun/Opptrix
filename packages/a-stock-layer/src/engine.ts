import type {
  FinancialSummary, QueryResult, StockKline, StockListItem, StockRealtime,
} from '@opptrix/shared'
import { inferCnAssetClassFromSymbol } from '@opptrix/shared'
import { CACHE_TYPE, Capability } from './core/capabilities.js'
import { Cache } from './core/cache.js'
import { watchlistCacheTtl } from '@opptrix/market-data-core'
import { DriverRegistry } from './core/registry.js'
import { CAP_METHOD } from './providers/common/base.js'
import { createProviderLoader, type ProviderLoader } from './providers/loader.js'
import { getProviderHealthTracker, type HealthSnapshot } from './core/provider-health.js'
import {
  isPermissionDeniedError,
  recordProviderPermissionDenial,
  getProviderPermissionDenialSnapshot,
  clearProviderPermissionDenials,
  clearAllProviderPermissionDenials,
} from './providers/common/permission-denial.js'
import {
  getFreeProviderThrottle,
  isFreeMarketDataProvider,
  pickNextDriver,
  recordProviderQueryEmpty,
  recordProviderQueryError,
  recordProviderQueryInvalid,
  recordProviderQuerySuccess,
  shouldSkipProviderQuery,
} from './core/free-provider-throttle.js'
import { ProviderSpeedRanker } from './core/speed-ranker.js'
import { LoadBalancer } from './core/load-balancer.js'
import { validateResponse } from './core/data-validator.js'
import { listProviderCustomMethods, findCustomMethod, type ProviderCustomMethods, type CustomMethodDef } from './core/custom-methods.js'
import { listCustomMethodsForAgent } from './core/custom-methods-agent.js'
import { normalizeCustomMethodArgs } from './core/custom-method-args.js'
import { wireRegistryMethodArgs } from './core/provider-wire.js'
import { getProviderConfigStore } from './providers/config-store.js'
import { resolveProviderAlias } from './providers/common/provider-aliases.js'
import { getUserDataStore } from '@opptrix/user-store'
import { createProviderCatalog, ProviderCatalogService } from './providers/catalog.js'
import { isCnEtfCode, inferCnAssetClass } from './core/instrument.js'
import { QueryPlanExecutor, defaultCacheType } from './core/query-plan.js'
import { executeIntradaySessionsPlan } from './core/query-plan-intraday.js'
import { normalizeUsSymbol } from './utils/us-market.js'
import { isRegionalEquityMarket, normalizeRegionalSymbol, type RegionalEquityMarket } from './utils/regional-symbol.js'
import { parseCryptoPair } from './utils/crypto-market.js'
import type { AssetClass, Market, InstrumentRef } from '@opptrix/shared'
import { instrumentProviderSymbol, normalizeInstrumentRef } from '@opptrix/shared'
import {
  resolveInstrumentQueryPlan,
  unsupportedInstrumentCapabilityMessage,
  type InstrumentDataCapability,
  type InstrumentQueryOpts,
} from './core/instrument-query.js'
import type {
  Dividend, DragonTiger, GlobalIndex, IndexKline, IndexRealtime,
  LimitUpDown, MarketMoneyFlow, MoneyFlow, NewsItem, SectorMoneyFlow,
  SentimentData, StockProfile, TechnicalIndicator,
} from './core/schema.js'
import { computeIndicators } from './utils/indicators.js'
import { PortfolioManager } from './portfolio/manager.js'
import { WatchlistManager } from './watchlist/manager.js'
import { watchlistItemKey } from './watchlist/instrument.js'
import { instrumentId } from './core/instrument.js'
import { normalizeCode, resolveStockMarketCode } from './utils/helpers.js'
import { isCnListedFundSymbol } from './core/fund-instrument.js'
import {
  BATCH_REALTIME_CHUNK,
  BATCH_REALTIME_ENGINE_CONCURRENCY,
  chunkArray,
  mapPool,
} from './utils/batch-chunk.js'

import {
  normalizePreOpenRealtimeQuote,
  normalizePreOpenRealtimeQuotes,
} from './utils/quote-normalize.js'

const MINUTE_PERIODS = new Set(['1m', '5m', '15m', '30m', '60m'])

/** ETF 净值序列可能升序/降序 — 按 date 取最新一条，避免误用成立日 nav[0] */
function pickLatestNavRow<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
): T | null {
  if (!rows?.length) return null
  let best = rows[0]!
  let bestDate = String(best.date ?? best.navDate ?? '').slice(0, 10)
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]!
    const date = String(row.date ?? row.navDate ?? '').slice(0, 10)
    if (!date) continue
    if (!bestDate || date > bestDate) {
      best = row
      bestDate = date
    }
  }
  return best
}

/** 追加 provider 失败原因 — 保留更早的明确错误（如 not found），避免被后续 空数据 覆盖 */
function appendProviderError(prev: string, next: string): string {
  return prev ? `${prev}; ${next}` : next
}

/** 引擎内 A 股分流：显式 assetClass 优先，其次 exchange，禁止无 exchange 时用裸码把 000001 猜成指数。 */
function resolveCnEngineAssetClass(
  code: string,
  market?: import('./utils/helpers.js').StockMarket,
  assetClass?: AssetClass,
): AssetClass {
  if (assetClass === 'INDEX' || assetClass === 'ETF' || assetClass === 'EQUITY') return assetClass
  if (market) return inferCnAssetClassFromSymbol(code, market)
  return inferCnAssetClass(code)
}

function mapIndexRealtimeResultToStock(
  result: QueryResult<IndexRealtime[]>,
): QueryResult<StockRealtime[]> {
  if (!result.success || !result.data?.length) return { ...result, data: undefined }
  const data = result.data.map(row => ({
    code: row.code,
    name: row.name,
    price: row.price,
    open: row.open,
    high: row.high,
    low: row.low,
    preClose: row.preClose,
    volume: row.volume,
    amount: row.amount,
    changePct: row.changePct,
  })) as StockRealtime[]
  return { ...result, data: normalizePreOpenRealtimeQuotes(data) }
}

export type { InstrumentDataCapability } from './core/instrument-query.js'

/** Multi-market data engine — provider fallback + cache (canonical name: MarketDataEngine) */
export class MarketDataEngine {
  readonly registry = new DriverRegistry()
  readonly cache = new Cache()
  readonly providerCatalog: ProviderCatalogService
  readonly providerLoader: ProviderLoader
  private readonly queryPlans: QueryPlanExecutor
  private readonly speedRanker: ProviderSpeedRanker
  private readonly loadBalancer: LoadBalancer
  private _portfolio?: PortfolioManager
  private _watchlist?: WatchlistManager

  /** Portfolio trade manager (lazy init) */
  get portfolio() {
    if (!this._portfolio) this._portfolio = new PortfolioManager(this)
    return this._portfolio
  }

  /** User watchlist (synced from client) */
  get watchlist() {
    if (!this._watchlist) this._watchlist = new WatchlistManager()
    return this._watchlist
  }
  constructor(autoDiscover = true) {
    const configStore = getProviderConfigStore()
    this.registry.bindConfigStore(configStore)
    this.providerLoader = createProviderLoader(this.registry, configStore)
    if (autoDiscover) {
      this.providerLoader.registerBuiltins()
      void this.providerLoader.loadInstalled()
        .catch(err => {
          console.warn('[MarketDataEngine] loadInstalled failed:', err)
        })
    }
    this.registry.refreshPriorities(configStore)
    this.speedRanker = new ProviderSpeedRanker(getUserDataStore().speedRanking)
    this.registry.attachSpeedRanker(this.speedRanker)
    this.loadBalancer = new LoadBalancer({ defaultMaxConcurrent: 3 })
    this.loadBalancer.attachSpeedRanker(this.speedRanker)
    this.registry.attachLoadBalancer(this.loadBalancer)
    this.providerCatalog = createProviderCatalog(this.registry)
    this.queryPlans = new QueryPlanExecutor(this.registry, this.cache, this.speedRanker)
  }

  private isWatchlistTarget(market: Market, assetClass: AssetClass, args: unknown[]): boolean {
    const symbol = this.extractSymbolFromArgs(market, assetClass, args)
    if (!symbol) return false
    const ref = market === 'CRYPTO'
      ? normalizeInstrumentRef({
        market,
        assetClass,
        symbol: symbol.split('/')[0]!,
        quote: symbol.split('/')[1] ?? 'USDT',
        exchange: 'binance',
      })
      : normalizeInstrumentRef({ market, assetClass, symbol })
    const key = instrumentId(ref)
    return this.watchlist.list().some(item => watchlistItemKey(item) === key)
  }

  private extractSymbolFromArgs(market: Market, assetClass: AssetClass, args: unknown[]): string {
    const first = String(args[0] ?? '').trim()
    if (!first) return ''
    if (market === 'CRYPTO') {
      const [base, quote] = first.includes('/') ? first.split('/') : [first, 'USDT']
      return instrumentProviderSymbol(normalizeInstrumentRef({
        market: 'CRYPTO',
        assetClass,
        symbol: base!,
        quote: quote ?? 'USDT',
      }))
    }
    return instrumentProviderSymbol(normalizeInstrumentRef({ market, assetClass, symbol: first }))
  }

  private async queryScoped<T>(
    market: Market,
    assetClass: AssetClass,
    cap: Capability,
    method: string,
    cacheType: string,
    useCache: boolean,
    args: unknown[],
    providerTimeoutMs = 15_000,
    instrumentRef?: InstrumentRef,
  ): Promise<QueryResult<T[]>> {
    const cacheParams = { method, market, assetClass, args: JSON.stringify(args) }
    const watchlistCache = useCache && cacheType && this.isWatchlistTarget(market, assetClass, args)
    if (watchlistCache) {
      const ttl = watchlistCacheTtl(cacheType)
      const cached = this.cache.getWithTtl<T[]>(cacheType, method, cacheParams, ttl)
      if (cached) return { success: true, data: cached, source: 'cache', cached: true }
    }

    const health = getProviderHealthTracker()
    const capStr = String(cap)
    let lastError = ''

    // 最多尝试 3 个 provider（负载均衡选择 + fallback）
    const attempted = new Set<string>()
    for (let attempt = 0; attempt < 3; attempt++) {
      const assetClassResolved = assetClass
      const allDrivers = this.registry.getProvidersWithFallback(market, assetClassResolved, cap)
      let driver = this.registry.getLoadAwareProvider(market, assetClassResolved, cap)
      if (!driver) {
        return { success: false, error: `没有可用的 provider 支持 [${market}/${assetClass}/${cap}]` }
      }
      const nextDriver = pickNextDriver(driver, allDrivers, attempted)
      if (!nextDriver) break
      driver = nextDriver
      attempted.add(driver.name)

      const skip = shouldSkipProviderQuery(driver.name, capStr, health)
      if (skip.skip) {
        lastError = appendProviderError(lastError, skip.lastError)
        continue
      }

      const fn = (driver as unknown as Record<string, unknown>)[method] as
        ((...a: unknown[]) => Promise<unknown[] | null> | unknown[] | null) | undefined
      if (!fn) continue

      // 通知负载均衡器：请求开始
      this.registry.notifyAcquire(driver.name)

      try {
        const wiredArgs = instrumentRef
          ? wireRegistryMethodArgs(driver.name, method, args, instrumentRef)
          : args
        const call = () => fn.apply(driver, wiredArgs) as Promise<unknown[] | null>
        const t0 = Date.now()
        const data = driver.selfThrottled
          ? await call()
          : await this.withProviderTimeout(call, providerTimeoutMs, driver.name)
        const elapsed = Date.now() - t0

        if (!data?.length) {
          recordProviderQueryEmpty(driver.name, capStr, health)
          this.registry.notifyRelease(driver.name, elapsed, false)
          this.speedRanker.recordResult(driver.name, capStr, elapsed, false)
          lastError = appendProviderError(lastError, `${driver.name}: 空数据`)
          continue
        }

        const validation = validateResponse(cap, data)
        if (!validation.valid) {
          recordProviderQueryInvalid(driver.name, capStr, validation.reason ?? 'invalid_response', health)
          this.registry.notifyRelease(driver.name, elapsed, false)
          this.speedRanker.recordResult(driver.name, capStr, elapsed, false)
          lastError = appendProviderError(lastError, `${driver.name}: ${validation.reason}`)
          continue
        }

        recordProviderQuerySuccess(driver.name, capStr, health)
        this.registry.notifyRelease(driver.name, elapsed, true)
        this.speedRanker.recordResult(driver.name, capStr, elapsed, true)
        if (watchlistCache) {
          const ttl = watchlistCacheTtl(cacheType)
          this.cache.setWithTtl(cacheType, data, method, cacheParams, ttl, driver.name)
        }
        return { success: true, data: data as T[], source: driver.name }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        lastError = appendProviderError(lastError, `${driver.name}: ${msg}`)
        if (!isFreeMarketDataProvider(driver.name) && isPermissionDeniedError(e)) {
          recordProviderPermissionDenial(driver.name, capStr, msg)
          this.registry.rebuildIndicesWithRanking()
        } else {
          recordProviderQueryError(driver.name, capStr, e, health)
        }
        this.registry.notifyRelease(driver.name, 0, false)
        this.speedRanker.recordResult(driver.name, capStr, 0, false)
        if (this.speedRanker.shouldRebuildIndices(driver.name, capStr)) {
          this.registry.rebuildIndicesWithRanking()
        }
      }
    }
    return { success: false, error: `所有 provider 均失败: ${lastError}` }
  }

  /** Wrap a provider call with a timeout — distinguishes timeout from other errors. */
  private withProviderTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    providerName: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`provider ${providerName} 超时 (${timeoutMs}ms)`))
      }, timeoutMs)

      fn().then(
        val => { clearTimeout(timer); resolve(val) },
        err => { clearTimeout(timer); reject(err) },
      )
    })
  }

  private async query<T>(
    cap: Capability,
    method: string,
    cacheType: string,
    useCache: boolean,
    args: unknown[],
  ): Promise<QueryResult<T[]>> {
    return this.queryScoped('CN', 'EQUITY', cap, method, cacheType, useCache, args)
  }

  private qScoped<T>(
    market: Market,
    assetClass: AssetClass,
    cap: Capability,
    method: string,
    useCache: boolean,
    ...args: unknown[]
  ) {
    const cacheType = CACHE_TYPE[cap] ?? method
    return this.queryScoped<T>(market, assetClass, cap, method, cacheType, useCache, args)
  }

  private qCrypto<T>(
    cap: Capability,
    method: string,
    cacheType: string,
    useCache: boolean,
    ...args: unknown[]
  ) {
    return this.queryScoped<T>('CRYPTO', 'CRYPTO_SPOT', cap, method, cacheType, useCache, args)
  }

  private q<T>(cap: Capability, method: string, useCache: boolean, ...args: unknown[]) {
    const cacheType = CACHE_TYPE[cap] ?? method
    return this.query<T>(cap, method, cacheType, useCache, args)
  }

  // ── Core market data ──
  realtime(
    code: string,
    market?: import('./utils/helpers.js').StockMarket,
    assetClass?: AssetClass,
  ): Promise<QueryResult<StockRealtime[]>> {
    const resolved = resolveCnEngineAssetClass(code, market, assetClass)
    if (resolved === 'INDEX') {
      return this.qScoped<IndexRealtime>(
        'CN', 'INDEX', Capability.INDEX_REALTIME, 'indexRealtime', false, code,
      ).then(mapIndexRealtimeResultToStock)
    }
    return this.qScoped<StockRealtime>('CN', resolved, Capability.STOCK_REALTIME, 'realtime', false, code, market).then(result => {
      if (!result.success || !result.data?.length) return result
      return { ...result, data: normalizePreOpenRealtimeQuotes(result.data) }
    })
  }
  batchRealtime(
    codes: string[],
    markets?: Record<string, import('./utils/helpers.js').StockMarket | undefined>,
  ): Promise<QueryResult<StockRealtime[]>> {
    return this.fetchBatchRealtime(codes, markets)
  }

  kline(code: string, periodOrCount: number): Promise<QueryResult<StockKline[]>>
  kline(
    code: string,
    period?: string,
    start?: string,
    end?: string,
    count?: number,
    market?: import('./utils/helpers.js').StockMarket,
    assetClass?: AssetClass,
  ): Promise<QueryResult<StockKline[]>>
  kline(
    code: string,
    periodOrCount: string | number = 'daily',
    start = '',
    end = '',
    count?: number,
    market?: import('./utils/helpers.js').StockMarket,
    assetClass?: AssetClass,
  ) {
    const resolved = resolveCnEngineAssetClass(code, market, assetClass)
    if (resolved === 'INDEX') {
      if (typeof periodOrCount === 'number') {
        return this.indexKline(code, periodOrCount) as Promise<QueryResult<StockKline[]>>
      }
      if (count != null) {
        return this.indexKline(code, periodOrCount, start, end, count) as Promise<QueryResult<StockKline[]>>
      }
      return this.indexKline(code, periodOrCount, start, end) as Promise<QueryResult<StockKline[]>>
    }
    if (typeof periodOrCount === 'number') {
      return this.fetchDailyKline(code, periodOrCount, 0, 'daily', market, resolved)
    }
    if (MINUTE_PERIODS.has(periodOrCount)) {
      return this.minuteKline(code, periodOrCount, count ?? 800, 0, market, resolved)
    }
    if (periodOrCount === 'daily' || periodOrCount === 'weekly' || periodOrCount === 'monthly') {
      return this.fetchDailyKline(code, count ?? 800, 0, periodOrCount, market, resolved)
    }
    const args = count != null
      ? [code, periodOrCount, start, end, count, market]
      : [code, periodOrCount, start, end, market]
    return this.query<StockKline>(Capability.STOCK_KLINE, 'kline', 'stock_kline', true, args)
  }

  private async fetchBatchRealtime(
    codes: string[],
    markets?: Record<string, import('./utils/helpers.js').StockMarket | undefined>,
  ): Promise<QueryResult<StockRealtime[]>> {
    if (!codes.length) {
      return { success: true, data: [] }
    }
    // 大批量：Engine 层再切片并行，片失败隔离；任一 chunk 成功则整体 success
    if (codes.length > BATCH_REALTIME_CHUNK) {
      const parts = chunkArray(codes, BATCH_REALTIME_CHUNK)
      const chunkResults = await mapPool(
        parts,
        BATCH_REALTIME_ENGINE_CONCURRENCY,
        async part => {
          const subsetMarkets = markets
            ? Object.fromEntries(
              part
                .map(c => {
                  const key = normalizeCode(String(c))
                  const m = markets[key] ?? markets[c]
                  return m != null ? ([key, m] as const) : null
                })
                .filter((e): e is readonly [string, import('./utils/helpers.js').StockMarket] => e != null),
            )
            : undefined
          try {
            return await this.fetchBatchRealtimeChunk(part, subsetMarkets)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return { success: false as const, error: msg, data: [] as StockRealtime[] }
          }
        },
      )
      const merged: StockRealtime[] = []
      const errors: string[] = []
      let source: string | undefined
      for (const r of chunkResults) {
        if (r.success && r.data?.length) {
          merged.push(...r.data)
          if (!source && r.source) source = r.source
        } else if (!r.success && r.error) {
          errors.push(r.error)
        }
      }
      if (merged.length) {
        return { success: true, data: merged, source }
      }
      return {
        success: false,
        error: errors.length ? errors.join('; ') : '所有 batchRealtime 分片均失败',
      }
    }
    return this.fetchBatchRealtimeChunk(codes, markets)
  }

  private fetchBatchRealtimeChunk(
    codes: string[],
    markets?: Record<string, import('./utils/helpers.js').StockMarket | undefined>,
  ): Promise<QueryResult<StockRealtime[]>> {
    const assetClass = codes.some(c => isCnEtfCode(String(c))) ? 'ETF' : 'EQUITY'
    return this.queryPlans.execute<StockRealtime>(
      this.queryPlans.getPlan('cn_equity_stock_realtime_batch'),
      {
        method: 'batchRealtime',
        cacheType: defaultCacheType(Capability.STOCK_REALTIME, 'batchRealtime'),
        useCache: false,
        args: [codes, markets],
        assetClass,
        mergeKey: item => normalizeCode(String((item as StockRealtime).code)),
      },
    )
  }

  private fetchDailyKline(
    code: string,
    count: number,
    startOffset = 0,
    period = 'daily',
    market?: import('./utils/helpers.js').StockMarket,
    assetClass?: AssetClass,
  ): Promise<QueryResult<StockKline[]>> {
    const resolved = resolveCnEngineAssetClass(code, market, assetClass)
    if (resolved === 'INDEX') {
      return this.fetchIndexKline(code, count, period) as Promise<QueryResult<StockKline[]>>
    }
    const want = Math.max(1, count)
    const klineAssetClass = resolved === 'ETF' || isCnEtfCode(code) ? 'ETF' : 'EQUITY'
    // 读缓存保留（兼容旧盘）；写仅 watchlist，与 queryScoped 对齐，避免长 K 键空间爆炸
    const writeCache = this.isWatchlistTarget('CN', klineAssetClass, [code])
    return this.queryPlans.execute<StockKline>(
      this.queryPlans.getPlan('cn_equity_stock_kline_daily'),
      {
        method: 'kline',
        cacheType: defaultCacheType(Capability.STOCK_KLINE, 'stock_kline'),
        useCache: true,
        writeCache,
        args: [code, period, '', '', want, market, startOffset],
        assetClass: klineAssetClass,
      },
    )
  }

  /** Minute OHLC — Tushare when configured (daily+ only; minute bars may be unavailable). */
  minuteKline(
    code: string,
    period: string,
    count = 800,
    startOffset = 0,
    market?: import('./utils/helpers.js').StockMarket,
    assetClass?: AssetClass,
  ): Promise<QueryResult<StockKline[]>> {
    const safeCount = Math.max(1, Math.min(count, 800))
    const safeOffset = Math.max(0, startOffset)
    return this.fetchMinuteKline(code, period, safeCount, safeOffset, market, assetClass)
  }

  private async fetchMinuteKline(
    code: string,
    period: string,
    count: number,
    startOffset: number,
    market?: import('./utils/helpers.js').StockMarket,
    assetClass?: AssetClass,
  ): Promise<QueryResult<StockKline[]>> {
    const resolved = resolveCnEngineAssetClass(code, market, assetClass)
    if (resolved === 'INDEX') {
      const primary = await this.indexKline(code, period, '', '', count) as QueryResult<StockKline[]>
      if (primary.success && primary.data?.length) return primary
      return { success: false, error: '指数分钟 K 暂无数据' }
    }
    const klineAssetClass = resolved === 'ETF' || isCnEtfCode(code) ? 'ETF' : 'EQUITY'
    const writeCache = this.isWatchlistTarget('CN', klineAssetClass, [code])
    const viaPlan = await this.queryPlans.execute<StockKline>(
      this.queryPlans.getPlan('cn_equity_stock_kline_minute'),
      {
        method: 'kline',
        cacheType: defaultCacheType(Capability.STOCK_KLINE, 'stock_kline'),
        useCache: true,
        writeCache,
        args: [code, period, '', '', count, market, startOffset],
        assetClass: klineAssetClass,
      },
    )
    return viaPlan
  }

  /** 1-minute multi-day history — licensed providers only. */
  minuteTrendKline(
    code: string,
    ndays = 1,
    count = 0,
    market?: import('./utils/helpers.js').StockMarket,
  ): Promise<QueryResult<StockKline[]>> {
    return this.query<StockKline>(
      Capability.STOCK_KLINE, 'minuteTrendKline', 'stock_minute_trend', false, [code, ndays, count, market],
    )
  }

  moneyFlow(code: string): Promise<QueryResult<MoneyFlow[]>> {
    return this.q(Capability.STOCK_MONEY_FLOW, 'moneyFlow', true, code)
  }
  indexRealtime(code: string): Promise<QueryResult<IndexRealtime[]>> {
    return this.qScoped('CN', 'INDEX', Capability.INDEX_REALTIME, 'indexRealtime', false, code)
  }

  indexKline(code: string, periodOrCount: number): Promise<QueryResult<IndexKline[]>>
  indexKline(code: string, period?: string, start?: string, end?: string, count?: number): Promise<QueryResult<IndexKline[]>>
  indexKline(code: string, periodOrCount: string | number = 'daily', start = '', end = '', count?: number) {
    if (typeof periodOrCount === 'number') {
      return this.fetchIndexKline(code, periodOrCount)
    }
    if (periodOrCount === 'daily' || periodOrCount === 'weekly' || periodOrCount === 'monthly') {
      return this.fetchIndexKline(code, count ?? 800, periodOrCount)
    }
    const args = count ? [code, periodOrCount, start, end, count] : [code, periodOrCount, start, end]
    return this.qScoped('CN', 'INDEX', Capability.INDEX_KLINE, 'indexKline', true, ...args)
  }

  private fetchIndexKline(
    code: string,
    count: number,
    period = 'daily',
  ): Promise<QueryResult<IndexKline[]>> {
    const want = Math.max(1, count)
    const writeCache = this.isWatchlistTarget('CN', 'INDEX', [code])
    return this.queryPlans.execute<IndexKline>(
      this.queryPlans.getPlan('cn_index_index_kline'),
      {
        method: 'indexKline',
        cacheType: defaultCacheType(Capability.INDEX_KLINE, 'index_kline'),
        useCache: true,
        writeCache,
        args: [code, period, '', '', want],
        assetClass: 'INDEX',
      },
    )
  }

  marketMoneyFlow(direction = 'north'): Promise<QueryResult<MarketMoneyFlow[]>> {
    return this.q(Capability.MARKET_MONEY_FLOW, 'marketMoneyFlow', true, direction)
  }
  sectorMoneyFlow(sectorType = 'industry'): Promise<QueryResult<SectorMoneyFlow[]>> {
    return this.q(Capability.SECTOR_MONEY_FLOW, 'sectorMoneyFlow', true, sectorType)
  }
  sectorList(plateType = '14'): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.SECTOR_LIST, 'sectorList', true, plateType)
  }

  // ── Research data ──
  profile(code: string): Promise<QueryResult<StockProfile[]>> {
    return this.q(Capability.STOCK_PROFILE, 'profile', true, code)
  }
  shareholders(code: string, reportDate = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.SHAREHOLDER, 'shareholders', true, code, reportDate)
  }
  financials(code: string, reportDate = '', reportType = 'annual'): Promise<QueryResult<FinancialSummary[]>> {
    return this.q(Capability.FINANCIAL_SUMMARY, 'financials', true, code, reportDate, reportType)
  }
  financialsQuarterly(code: string): Promise<QueryResult<FinancialSummary[]>> {
    return this.financials(code, '', 'quarter')
  }
  news(code: string, page = 1, pageSize = 20, newsType = 'all'): Promise<QueryResult<NewsItem[]>> {
    return this.q(Capability.NEWS, 'news', page <= 2, code, page, pageSize, newsType)
  }
  /** 按公告 URL 提取正文（HTML 去标签 / PDF 文字），压缩后供 Agent 阅读 */
  async announcementContent(
    url: string,
    maxChars = 16_000,
  ): Promise<QueryResult<import('./announcement/index.js').AnnouncementContent>> {
    const { fetchAnnouncementContentByUrl } = await import('./announcement/index.js')
    try {
      const data = await fetchAnnouncementContentByUrl(url, { maxChars })
      if (!data?.text) {
        return { success: false, error: '未能提取公告正文' }
      }
      return { success: true, data, source: data.source }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  sentiment(code: string): Promise<QueryResult<SentimentData[]>> {
    return this.q(Capability.SENTIMENT, 'sentiment', false, code)
  }

  // ── Trading derivatives ──
  dragonTiger(date = ''): Promise<QueryResult<DragonTiger[]>> {
    return this.q(Capability.DRAGON_TIGER, 'dragonTiger', true, date)
  }
  marginTrade(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.MARGIN_TRADE, 'marginTrade', true, code)
  }
  dividend(code: string): Promise<QueryResult<Dividend[]>> {
    return this.q(Capability.DIVIDEND, 'dividend', true, code)
  }
  cashFlow(code: string, reportDate = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.CASH_FLOW, 'cashFlow', true, code, reportDate)
  }
  stockList(market = 'all'): Promise<QueryResult<StockListItem[]>> {
    return this.q(Capability.STOCK_LIST, 'stockList', true, market)
  }
  stockBasic(code = '', listStatus = 'L'): Promise<QueryResult<StockListItem[]>> {
    return this.q(Capability.STOCK_BASIC, 'stockBasic', true, code, listStatus)
  }
  limitUpdown(date = ''): Promise<QueryResult<LimitUpDown[]>> {
    return this.q(Capability.LIMIT_UPDOWN, 'limitUpdown', false, date)
  }
  marketBreadth(date = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.MARKET_BREADTH, 'marketBreadth', false, date)
  }
  tradeCalendar(year = 0): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.TRADE_CALENDAR, 'tradeCalendar', true, year)
  }
  globalIndex(code = ''): Promise<QueryResult<GlobalIndex[]>> {
    return this.q(Capability.GLOBAL_INDEX, 'globalIndex', false, code)
  }
  exchangeRate(pair = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.EXCHANGE_RATE, 'exchangeRate', true, pair)
  }

  balanceSheet(code: string, reportDate = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.BALANCE_SHEET, 'balanceSheet', true, code, reportDate)
  }
  incomeStatement(code: string, reportDate = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.INCOME_STMT, 'incomeStatement', true, code, reportDate)
  }
  instHolding(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.INST_HOLDING, 'instHolding', true, code)
  }
  blockTrade(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.BLOCK_TRADE, 'blockTrade', true, code)
  }
  lockupExpiry(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.LOCKUP_EXPIRY, 'lockupExpiry', true, code)
  }
  sharePledge(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.SHARE_PLEDGE, 'sharePledge', true, code)
  }
  intradayTick(code: string, date = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.INTRADAY_TICK, 'intradayTick', false, code, date)
  }

  /** Multi-day intraday — licensed providers only. */
  async fetchIntradaySessions(
    code: string,
    ndays = 5,
    market?: import('./utils/helpers.js').StockMarket,
  ) {
    return executeIntradaySessionsPlan(this.registry, code, ndays, market)
  }

  indexConstituents(indexCode: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.INDEX_CONST, 'indexConstituents', true, indexCode)
  }
  insiderTrade(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.INSIDER_TRADE, 'insiderTrade', true, code)
  }
  perfForecast(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.PERF_FORECAST, 'perfForecast', true, code)
  }
  ipoData(): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.IPO_DATA, 'ipoData', true)
  }
  convertibleBonds(): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.CONVERTIBLE_BOND, 'convertibleBonds', false)
  }
  etfData(etfCode = '') {
    return this.etfList(etfCode)
  }

  etfList(etfCode = '') {
    return this.qScoped('CN', 'ETF', Capability.ETF_LIST, 'etfList', true, 'CN', etfCode)
  }

  etfProfile(etfCode: string) {
    return this.qScoped('CN', 'ETF', Capability.ETF_PROFILE, 'etfProfile', true, etfCode)
  }

  etfNav(etfCode: string) {
    return this.qScoped('CN', 'ETF', Capability.ETF_NAV, 'etfNav', true, etfCode)
  }

  etfHoldings(etfCode: string) {
    return this.qScoped('CN', 'ETF', Capability.ETF_HOLDINGS, 'etfHoldings', true, etfCode)
  }

  fundList(fundCode = '') {
    return this.qScoped('CN', 'FUND', Capability.FUND_LIST, 'fundList', true, 'CN', fundCode)
  }

  fundProfile(fundCode: string) {
    return this.qScoped('CN', 'FUND', Capability.FUND_PROFILE, 'fundProfile', true, fundCode)
  }

  fundNav(fundCode: string) {
    const code = normalizeCode(fundCode)
    return this.fundNavWithDepthFallback(code)
  }

  /**
   * 净值序列过短时尝试其他已注册 Provider。
   * 扶摇在传 range（如 fyear）后应返回完整序列；本 fallback 仍留给未配置扶摇 /
   * 扶摇失败时由 Tushare 等补齐。
   */
  private async fundNavWithDepthFallback(
    code: string,
  ): Promise<QueryResult<Record<string, unknown>[]>> {
    const MIN_NAV_ROWS = 20
    const primary = await this.qScoped<Record<string, unknown>>(
      'CN', 'FUND', Capability.FUND_NAV, 'fundNav', true, code,
    )
    if (primary.success && (primary.data?.length ?? 0) >= MIN_NAV_ROWS) return primary

    const tried = new Set<string>()
    if (primary.source) tried.add(primary.source)

    let best: QueryResult<Record<string, unknown>[]> = primary
    const drivers = this.registry.getProvidersWithFallback('CN', 'FUND', Capability.FUND_NAV)
    for (const driver of drivers) {
      if (tried.has(driver.name)) continue
      tried.add(driver.name)
      const fn = (driver as unknown as Record<string, unknown>).fundNav as
        | ((c: string) => Promise<Record<string, unknown>[] | null>)
        | undefined
      if (!fn) continue
      try {
        const rows = await fn.call(driver, code)
        if (!rows?.length) continue
        if (!best.success || rows.length > (best.data?.length ?? 0)) {
          best = { success: true, data: rows, source: driver.name }
        }
        if (rows.length >= MIN_NAV_ROWS) break
      } catch {
        /* try next provider */
      }
    }
    return best
  }

  fundHoldings(fundCode: string) {
    return this.qScoped('CN', 'FUND', Capability.FUND_HOLDINGS, 'fundHoldings', true, fundCode)
  }

  fundQuote(fundCode: string) {
    const code = normalizeCode(fundCode)
    // 与 resolveInstrumentQueryPlan(fund_quote) useCache 对齐：净值日更可缓存
    return this.qScoped('CN', 'FUND', Capability.FUND_QUOTE, 'fundQuote', true, code)
      .then(result => this.listedFundQuoteFallback(code, result as QueryResult<Record<string, unknown>[]>))
  }

  /** 场内基金 fundQuote 失败时，回退 A 股实时行情（交易所价） */
  private async listedFundQuoteFallback(
    code: string,
    primary: QueryResult<Record<string, unknown>[]>,
  ): Promise<QueryResult<Record<string, unknown>[]>> {
    if (primary.success && primary.data?.length) return primary
    if (!isCnListedFundSymbol(code)) return primary
    const rt = await this.realtime(code, resolveStockMarketCode(code))
    const row = rt.data?.[0]
    if (!rt.success || !row) return primary
    return {
      success: true,
      data: [{
        code,
        name: row.name,
        price: row.price,
        exchangePrice: row.price,
        changePct: row.changePct,
        change: row.change,
        open: row.open,
        high: row.high,
        low: row.low,
        preClose: row.preClose,
        volume: row.volume,
        amount: row.amount,
        exchangeVolume: row.volume,
        exchangeAmount: row.amount,
        source: rt.source,
      }],
      source: rt.source,
    }
  }

  async fundSnapshot(fundCode: string) {
    const code = normalizeCode(fundCode)
    const listed = isCnListedFundSymbol(code)
    const [profile, quoteRes] = await Promise.all([
      this.fundProfile(code),
      listed ? this.fundQuote(code) : Promise.resolve(null),
    ])
    const profileRow = profile.data?.[0] as Record<string, unknown> | undefined
    const quoteRow = quoteRes?.success
      ? quoteRes.data?.[0] as Record<string, unknown> | undefined
      : undefined
    const success = profile.success || (listed && quoteRes?.success && quoteRow)
    if (!success) {
      return {
        success: false,
        data: null,
        source: profile.source,
      }
    }
    const mergedProfile = profileRow ?? (quoteRow
      ? {
          code,
          name: quoteRow.name,
          unitNav: quoteRow.unitNav,
          accNav: quoteRow.accNav,
          changePct: quoteRow.changePct,
          navDate: quoteRow.navDate,
        }
      : null)
    const navSource = mergedProfile ?? quoteRow
    const latestNav = navSource
      ? {
          date: String(navSource.navDate ?? '').slice(0, 10),
          nav: navSource.unitNav,
          accNav: navSource.accNav,
          changePct: navSource.changePct,
        }
      : null
    const quote = quoteRow ?? (profileRow
      ? {
          unitNav: profileRow.unitNav,
          accNav: profileRow.accNav,
          changePct: profileRow.changePct,
          navDate: profileRow.navDate,
          name: profileRow.name,
        }
      : null)
    return {
      success: true,
      data: {
        code,
        profile: mergedProfile ?? null,
        nav: latestNav ?? null,
        quote,
      },
      source: profile.source ?? quoteRes?.source,
    }
  }

  async etfSnapshot(etfCode: string) {
    const code = normalizeCode(etfCode)
    const exchange = resolveStockMarketCode(code)
    const [profile, nav, quote] = await Promise.all([
      this.etfProfile(code),
      this.etfNav(code),
      this.realtime(code, exchange),
    ])
    return {
      success: profile.success || nav.success || quote.success,
      data: {
        code,
        profile: profile.data?.[0] ?? null,
        nav: pickLatestNavRow(nav.data as Record<string, unknown>[] | undefined) ?? null,
        quote: quote.data?.[0] ?? null,
      },
      source: profile.source ?? nav.source ?? quote.source,
    }
  }

  // ── US equities (Phase 2) ──

  /** @deprecated Prefer `queryInstrumentData({ market: 'US', ... }, 'realtime')` */
  usRealtime(symbol: string) {
    const sym = normalizeUsSymbol(symbol)
    return this.qScoped('US', 'EQUITY', Capability.STOCK_REALTIME, 'realtime', true, sym)
  }

  /**
   * US / HK / CRYPTO 批量实时。
   * 优先走 Provider `batchRealtime`（如 Tickflow quotes 批量 HTTP）；
   * 无 batch 实现的源会失败，由 Hub 回退到逐标的 realtime。
   * symbols > BATCH_REALTIME_CHUNK 时 Engine 自动分片并行，片失败隔离。
   */
  async batchRealtimeByMarket(
    market: 'US' | 'HK' | 'CRYPTO',
    symbols: string[],
  ) {
    if (!symbols.length) {
      return { success: true as const, data: [] as StockRealtime[] }
    }
    if (symbols.length > BATCH_REALTIME_CHUNK) {
      const parts = chunkArray(symbols, BATCH_REALTIME_CHUNK)
      const chunkResults = await mapPool(
        parts,
        BATCH_REALTIME_ENGINE_CONCURRENCY,
        async part => {
          try {
            return await this.batchRealtimeByMarketChunk(market, part)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return { success: false as const, error: msg, data: [] as StockRealtime[] }
          }
        },
      )
      const merged: StockRealtime[] = []
      const errors: string[] = []
      let source: string | undefined
      for (const r of chunkResults) {
        if (r.success && r.data?.length) {
          merged.push(...(r.data as StockRealtime[]))
          if (!source && r.source) source = r.source
        } else if (!r.success && 'error' in r && r.error) {
          errors.push(String(r.error))
        }
      }
      if (merged.length) {
        return { success: true as const, data: merged, source }
      }
      return {
        success: false as const,
        error: errors.length ? errors.join('; ') : '所有 batchRealtime 分片均失败',
      }
    }
    return this.batchRealtimeByMarketChunk(market, symbols)
  }

  private batchRealtimeByMarketChunk(
    market: 'US' | 'HK' | 'CRYPTO',
    symbols: string[],
  ) {
    if (market === 'CRYPTO') {
      return this.qCrypto<StockRealtime>(
        Capability.STOCK_REALTIME,
        'batchRealtime',
        'crypto_realtime',
        false,
        symbols,
      )
    }
    const normalized = market === 'US'
      ? symbols.map(s => normalizeUsSymbol(s))
      : symbols
    return this.qScoped(
      market,
      'EQUITY',
      Capability.STOCK_REALTIME,
      'batchRealtime',
      false,
      normalized,
    )
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'US', ... }, 'kline')` */
  usKline(symbol: string, count = 180) {
    const sym = normalizeUsSymbol(symbol)
    return this.qScoped(
      'US', 'EQUITY', Capability.STOCK_KLINE, 'kline', true,
      sym, 'daily', '', '', count,
    )
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'US', ... }, 'profile')` */
  usProfile(symbol: string) {
    const sym = normalizeUsSymbol(symbol)
    return this.qScoped('US', 'EQUITY', Capability.STOCK_PROFILE, 'profile', true, sym)
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'US', ... }, 'stock_list')` */
  usStockList(keyword = '') {
    return this.qScoped('US', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, 'US', keyword)
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'US', ... }, 'financials')` */
  usFinancials(symbol: string, reportDate = '', reportType = 'annual') {
    const sym = normalizeUsSymbol(symbol)
    return this.qScoped('US', 'EQUITY', Capability.FINANCIAL_SUMMARY, 'financials', true, sym, reportDate, reportType)
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'US', ... }, 'snapshot')` */
  async usSnapshot(symbol: string) {
    const sym = normalizeUsSymbol(symbol)
    const [profile, quote, klines] = await Promise.all([
      this.usProfile(sym),
      this.usRealtime(sym),
      this.usKline(sym, 10),
    ])
    return {
      success: profile.success || quote.success || klines.success,
      data: {
        code: sym,
        profile: profile.data?.[0] ?? null,
        quote: quote.data?.[0] ?? null,
        recentKlines: klines.data ?? [],
      },
      source: profile.source ?? quote.source ?? klines.source,
    }
  }

  // ── JP / KR / HK equities ──

  /** @deprecated Prefer `queryInstrumentData({ market, ... }, 'realtime')` */
  regionalRealtime(market: RegionalEquityMarket, symbol: string) {
    return this.qScoped(market, 'EQUITY', Capability.STOCK_REALTIME, 'realtime', true, symbol)
  }

  /** @deprecated Prefer `queryInstrumentData({ market, ... }, 'kline')` */
  regionalKline(market: RegionalEquityMarket, symbol: string, count = 180) {
    return this.qScoped(
      market, 'EQUITY', Capability.STOCK_KLINE, 'kline', true,
      symbol, 'daily', '', '', count,
    )
  }

  /** @deprecated Prefer `queryInstrumentData({ market, ... }, 'stock_list')` */
  regionalStockList(market: RegionalEquityMarket, keyword = '') {
    return this.qScoped(
      market, 'EQUITY', Capability.STOCK_LIST, 'stockList', true, market, keyword,
    )
  }

  /** @deprecated Prefer `queryInstrumentData({ market, ... }, 'profile')` */
  regionalProfile(market: RegionalEquityMarket, symbol: string) {
    return this.qScoped(market, 'EQUITY', Capability.STOCK_PROFILE, 'profile', true, symbol)
  }

  /** @deprecated Prefer `queryInstrumentData({ market, ... }, 'snapshot')` */
  async regionalSnapshot(market: RegionalEquityMarket, symbol: string) {
    const [profile, quote, klines] = await Promise.all([
      this.regionalProfile(market, symbol),
      this.regionalRealtime(market, symbol),
      this.regionalKline(market, symbol, 10),
    ])
    return {
      success: profile.success || quote.success || klines.success,
      data: {
        code: symbol,
        profile: profile.data?.[0] ?? null,
        quote: quote.data?.[0] ?? null,
        recentKlines: klines.data ?? [],
      },
      source: profile.source ?? quote.source ?? klines.source,
    }
  }

  /** DataEngine 收敛入口 — 按 InstrumentRef + capability 经 Registry 路由 */
  queryInstrumentData(
    ref: InstrumentRef,
    capability: InstrumentDataCapability,
    opts?: InstrumentQueryOpts,
  ) {
    const plan = resolveInstrumentQueryPlan(ref, capability, opts)
    if (!plan) {
      return Promise.resolve({
        success: false,
        error: unsupportedInstrumentCapabilityMessage(ref, capability),
      })
    }

    switch (plan.kind) {
      case 'cn_realtime':
        return this.realtime(
          plan.symbol,
          plan.exchange as import('./utils/helpers.js').StockMarket | undefined,
          plan.assetClass,
        )
      case 'cn_kline':
        if ((plan.period && plan.period !== 'daily') || plan.start || plan.end) {
          return this.kline(
            plan.symbol,
            plan.period ?? 'daily',
            plan.start ?? '',
            plan.end ?? '',
            plan.count,
            plan.exchange as import('./utils/helpers.js').StockMarket | undefined,
            plan.assetClass,
          )
        }
        return this.kline(
          plan.symbol,
          'daily',
          '',
          '',
          plan.count ?? 120,
          plan.exchange as import('./utils/helpers.js').StockMarket | undefined,
          plan.assetClass,
        )
      case 'composite_snapshot':
        if (plan.market === 'US') return this.usSnapshot(plan.symbol)
        if (plan.market === 'CRYPTO') return this.cryptoSnapshot(plan.symbol)
        if (plan.market === 'CN' && plan.assetClass === 'ETF') return this.etfSnapshot(plan.symbol)
        if (plan.market === 'CN' && plan.assetClass === 'FUND') return this.fundSnapshot(plan.symbol)
        if (isRegionalEquityMarket(plan.market)) {
          return this.regionalSnapshot(plan.market, plan.symbol)
        }
        return Promise.resolve({ success: false, error: `不支持 snapshot: ${plan.market}` })
      case 'registry': {
        const cacheType = CACHE_TYPE[plan.capability] ?? plan.method
        return this.queryScoped(
          plan.market,
          plan.assetClass,
          plan.capability,
          plan.method,
          cacheType,
          plan.useCache,
          plan.args,
          15_000,
          plan.ref,
        ).then(result => {
          if (plan.capability === Capability.INDEX_REALTIME) {
            return mapIndexRealtimeResultToStock(result as QueryResult<IndexRealtime[]>)
          }
          if (
            plan.capability === Capability.FUND_QUOTE
            && plan.market === 'CN'
            && plan.assetClass === 'FUND'
          ) {
            const code = normalizeCode(String(plan.args[0] ?? ''))
            return this.listedFundQuoteFallback(code, result as QueryResult<Record<string, unknown>[]>)
          }
          return result
        })
      }
      default:
        return Promise.resolve({
          success: false,
          error: unsupportedInstrumentCapabilityMessage(ref, capability),
        })
    }
  }

  // ── Crypto SPOT (Phase 3) ──

  /** @deprecated Prefer `queryInstrumentData({ market: 'CRYPTO', ... }, 'realtime')` */
  cryptoRealtime(pair: string) {
    const sym = parseCryptoPair(pair)?.pair ?? pair
    return this.qCrypto<StockRealtime>(Capability.STOCK_REALTIME, 'realtime', 'crypto_realtime', true, sym)
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'CRYPTO', ... }, 'kline')` */
  cryptoKline(pair: string, count = 180) {
    const sym = parseCryptoPair(pair)?.pair ?? pair
    return this.qCrypto<StockKline>(
      Capability.STOCK_KLINE, 'kline', 'crypto_kline', true,
      sym, 'daily', '', '', count,
    )
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'CRYPTO', ... }, 'stock_list')` */
  cryptoList(keyword = '') {
    return this.qCrypto<StockListItem>(Capability.STOCK_LIST, 'stockList', 'stock_list', true, 'CRYPTO', keyword)
  }

  /** @deprecated Prefer `queryInstrumentData({ market: 'CRYPTO', ... }, 'snapshot')` */
  async cryptoSnapshot(pair: string) {
    const sym = parseCryptoPair(pair)?.pair ?? pair
    const [quote, klines] = await Promise.all([
      this.cryptoRealtime(sym),
      this.cryptoKline(sym, 10),
    ])
    return {
      success: quote.success || klines.success,
      data: {
        pair: sym,
        quote: quote.data?.[0] ?? null,
        recentKlines: klines.data ?? [],
      },
      source: quote.source ?? klines.source,
    }
  }

  managerInfo(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.MANAGER_INFO, 'managerInfo', true, code)
  }
  shareholderPlans(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.SHAREHOLDER_PLAN, 'shareholderPlans', true, code)
  }
  buyback(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.BUYBACK, 'buyback', true, code)
  }
  macroIndicator(indicator = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.MACRO_INDICATOR, 'macroIndicator', true, indicator)
  }

  mainBusiness(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.MAIN_BUSINESS, 'mainBusiness', true, code)
  }
  topCustomerSupplier(code: string, direction = 'customer'): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.TOP_CUSTOMER, 'topCustomerSupplier', true, code, direction)
  }
  actualController(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.ACTUAL_CONTROLLER, 'actualController', true, code)
  }
  subsidiaries(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.SUBSIDIARY, 'subsidiaries', true, code)
  }
  relatedPartyTrades(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.RELATED_PARTY, 'relatedPartyTrades', true, code)
  }
  rdInvestment(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.RD_INVESTMENT, 'rdInvestment', true, code)
  }
  maEvents(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.MERGER_ACQUISITION, 'maEvents', true, code)
  }
  employeeComposition(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.EMPLOYEE_COMP, 'employeeComposition', true, code)
  }
  institutionalVisits(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.INSTITUTIONAL_VISIT, 'institutionalVisits', true, code)
  }
  peerCompanies(code: string): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.PEER_COMPANY, 'peerCompanies', true, code)
  }

  chipDistribution(code: string, adjust = ''): Promise<QueryResult<import('./core/schema.js').ChipDistribution[]>> {
    return this.q(Capability.CHIP_DISTRIBUTION, 'chipDistribution', true, code, adjust)
  }

  chipProfile(code: string, adjust = ''): Promise<QueryResult<import('./core/schema.js').ChipDistributionProfile[]>> {
    return this.q(Capability.CHIP_DISTRIBUTION, 'chipProfile', true, code, adjust)
  }

  async techIndicator(code: string, period = 'daily', count = 120): Promise<QueryResult<TechnicalIndicator[]>> {
    const kl = await this.kline(code, count)
    if (!kl.success || !kl.data?.length) return { success: false, error: kl.error ?? 'kline failed' }
    const indicators = computeIndicators(code, kl.data)
    return { success: true, data: indicators, source: 'calc' }
  }

  // ── Cache / driver management ──
  clearCache(dataType?: string) {
    return dataType ? this.cache.clearType(dataType) : this.cache.clearAll()
  }
  clearCacheForProvider(providerId: string) {
    return this.cache.clearBySource(providerId) + this.cache.clearBySource('mixed')
  }
  cacheStats() { return this.cache.stats() }
  listDrivers() { return this.registry.listDriverInfo() }
  listProviders() { return this.providerCatalog.listCatalog() }
  getProviderConfig(providerId: string) { return this.providerCatalog.getPublic(providerId) }
  saveProviderConfig(providerId: string, patch: Parameters<ProviderCatalogService['saveConfig']>[1]) {
    const result = this.providerCatalog.saveConfig(providerId, patch)
    this.clearCacheForProvider(providerId)
    return result
  }
  saveProviderOrder(orderedProviderIds: string[]) {
    const catalog = this.providerCatalog.saveProviderOrder(orderedProviderIds)
    for (const id of orderedProviderIds) this.clearCacheForProvider(id)
    return catalog
  }
  listProviderBindingOverrides(providerId: string) {
    return this.providerCatalog.listPublicBindingOverrides(providerId)
  }
  saveProviderBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
    patch: import('@opptrix/shared').ProviderBindingOverridePatch,
  ) {
    const items = this.providerCatalog.saveBindingOverride(providerId, market, assetClass, capability, patch)
    this.clearCacheForProvider(providerId)
    return items
  }
  testProviderConnection(providerId: string, overrides?: Record<string, unknown>) {
    return this.providerCatalog.testConnection(providerId, overrides)
  }
  async reloadProvider(providerId: string) {
    this.clearCacheForProvider(providerId)
    return this.providerLoader.reload(providerId)
  }
  async rescanProviders() {
    const prev = new Set(this.providerLoader.listInstalled().map(r => r.providerId))
    const loaded = await this.providerLoader.rescan()
    const touched = new Set([...prev, ...loaded.map(r => r.providerId)])
    for (const id of touched) this.clearCacheForProvider(id)
    return loaded
  }
  listInstalledProviders() {
    return this.providerLoader.listInstalled()
  }
  registerDriver(driver: Parameters<DriverRegistry['register']>[0]) { this.registry.register(driver) }
  unregisterDriver(name: string) { this.registry.unregister(name) }

  // ── Provider health / circuit breaker ──

  /** Get health snapshot for all provider×capability combinations. */
  providerHealth(): HealthSnapshot {
    return getProviderHealthTracker().getAll()
  }

  /** Reset health for a specific provider (or all if no args). */
  resetProviderHealth(providerId?: string, capability?: string) {
    getProviderHealthTracker().reset(providerId, capability)
  }

  /** Force-close a tripped circuit for a provider×capability. */
  forceCloseProviderCircuit(providerId: string, capability: string) {
    getProviderHealthTracker().forceClose(providerId, capability)
  }

  /** Prune stale health entries. */
  pruneStaleHealth(): number {
    return getProviderHealthTracker().prune()
  }

  /** 免费源限流冷却状态（持久化，跨进程生效） */
  freeProviderThrottleStatus() {
    return getFreeProviderThrottle().listAll()
  }

  freeProviderThrottleLogs(providerId?: string, limit = 100) {
    return getFreeProviderThrottle().listLogs(providerId, limit)
  }

  resetFreeProviderThrottle(providerId?: string) {
    getFreeProviderThrottle().reset(providerId)
  }

  /** 已登记「权限不足」的 provider×接口（换 Key / 重启用后清除）。 */
  providerPermissionDenials() {
    return getProviderPermissionDenialSnapshot()
  }

  /** 清除权限拒绝登记并重建路由索引。 */
  resetProviderPermissionDenials(providerId?: string) {
    if (providerId) clearProviderPermissionDenials(providerId)
    else clearAllProviderPermissionDenials()
    this.registry.rebuildIndicesWithRanking()
  }

  // ── Provider custom methods ──

  /** List all available custom methods across providers (or for a specific provider). */
  listCustomMethods(providerId?: string): ProviderCustomMethods[] {
    return listProviderCustomMethods(providerId)
  }

  /** Agent 友好目录 — 压缩体积，支持 keyword / limit */
  listCustomMethodsForAgent(options?: {
    providerId?: string
    keyword?: string
    limit?: number
  }) {
    return listCustomMethodsForAgent(options)
  }

  /** Invoke a custom method on a specific provider. Returns the raw result or error. */
  async invokeCustomMethod(
    providerId: string,
    methodName: string,
    args: unknown[] = [],
  ): Promise<{ success: boolean; data?: unknown; error?: string; argTransforms?: string[] }> {
    const resolvedId = resolveProviderAlias(providerId)
    const def = findCustomMethod(resolvedId, methodName)
    if (!def) {
      return { success: false, error: `未知的自定义方法: ${providerId}.${methodName}` }
    }

    const driver = this.registry.get(resolvedId) as Record<string, unknown> | undefined
    if (!driver) {
      return { success: false, error: `Provider ${resolvedId} 未注册` }
    }

    const fn = driver[methodName] as ((...a: unknown[]) => Promise<unknown>) | undefined
    if (typeof fn !== 'function') {
      return { success: false, error: `Provider ${providerId} 未实现 ${methodName}` }
    }

    try {
      const health = getProviderHealthTracker()
      const capStr = `custom:${methodName}`

      const skip = shouldSkipProviderQuery(resolvedId, capStr, health)
      if (skip.skip) {
        return { success: false, error: skip.lastError }
      }

      const { args: normalizedArgs, transforms } = normalizeCustomMethodArgs(resolvedId, def, args)

      const result = await this.withProviderTimeout(
        () => fn.apply(driver, normalizedArgs),
        15_000,
        resolvedId,
      )

      const isEmpty = result == null
        || (Array.isArray(result) && result.length === 0)
      if (isEmpty) {
        recordProviderQueryEmpty(resolvedId, capStr, health)
        return {
          success: true,
          data: result ?? null,
          ...(transforms.length ? { argTransforms: transforms } : {}),
        }
      }

      recordProviderQuerySuccess(resolvedId, capStr, health)
      return {
        success: true,
        data: result,
        ...(transforms.length ? { argTransforms: transforms } : {}),
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const health = getProviderHealthTracker()
      const capStr = `custom:${methodName}`
      if (!isFreeMarketDataProvider(resolvedId) && isPermissionDeniedError(e)) {
        recordProviderPermissionDenial(resolvedId, capStr, msg)
        this.registry.rebuildIndicesWithRanking()
      } else {
        recordProviderQueryError(resolvedId, capStr, e, health)
      }
      return { success: false, error: msg }
    }
  }
}

export { MarketDataEngine as AshareEngine }

export { DriverRegistry } from './core/registry.js'
export { Capability, CACHE_TYPE } from './core/capabilities.js'
export { Cache, DEFAULT_TTL } from './core/cache.js'
export * from './core/schema.js'
export { BaseDriver, CAP_METHOD } from './providers/common/base.js'
export {
  ProviderHealthTracker,
  getProviderHealthTracker,
  CircuitState,
  FAILURE_THRESHOLD,
  BASE_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
} from './core/provider-health.js'
export {
  getFreeProviderThrottle,
  shouldSkipProviderQuery,
  recordProviderQuerySuccess,
  recordProviderQueryEmpty,
  recordProviderQueryError,
  isFreeMarketDataProvider,
} from './core/free-provider-throttle.js'
export { invokeProviderDriverMethod } from './core/provider-driver-guard.js'
export type { InterfaceHealth, HealthSnapshot } from './core/provider-health.js'
export {
  listProviderCustomMethods,
  findCustomMethod,
} from './core/custom-methods.js'
export { listCustomMethodsForAgent } from './core/custom-methods-agent.js'
export { normalizeCustomMethodArgs } from './core/custom-method-args.js'
export type { NormalizedCustomMethodArgs } from './core/custom-method-args.js'
export type {
  AgentCustomMethodListResult,
  AgentCustomMethodProviderBlock,
} from './core/custom-methods-agent.js'
export type { CustomMethodDef, CustomMethodParam, ProviderCustomMethods } from './core/custom-methods.js'
export {
  TushareDriver,
  TickflowDriver,
  StockIndexDriver,
  BinanceDriver,
  OkxDriver,
  BaostockDriver,
  ZzshareDriver,
  TonghuashunDriver,
  registerAllDrivers,
} from './providers/register.js'
export { loadTushareConfig, isTushareEnabled, saveTushareConfig, publicTushareConfig } from './providers/tushare/config.js'
export { testTushareConnection } from './providers/tushare/api/client.js'
export { testTickflowConnection } from './providers/tickflow/api/client.js'
export { testBaostockConnection } from './providers/baostock/api/client.js'
export { testZzshareConnection } from './providers/zzshare/api/client.js'
export { loadTickflowConfig, isTickflowEnabled } from './providers/tickflow/config.js'
export { loadBaostockConfig, isBaostockEnabled } from './providers/baostock/config.js'
export { loadZzshareConfig, isZzshareEnabled } from './providers/zzshare/config.js'
export { getProviderConfigStore, ProviderConfigStore } from './providers/config-store.js'
export { ProviderCatalogService, createProviderCatalog } from './providers/catalog.js'
export { PROVIDER_MANIFESTS, listProviderManifests, getProviderManifest } from './providers/manifests.js'
export {
  ProviderLoader,
  createProviderLoader,
  getProviderLoader,
} from './providers/loader.js'
export { ManifestRegistry, getManifestRegistry } from './providers/manifest-registry.js'
export {
  packOppx,
  unpackOppx,
  inspectOppxPackage,
  validateOppxSignature,
  validatePluginDirectory,
  suggestOppxFilename,
  installFromOppx,
  installFromDirectory,
  uninstallProviderPlugin,
  readInstalledIndex,
  writeInstalledIndex,
  listInstalledProviders,
  providersRootDir,
  installedIndexPath,
  installedProviderDir,
} from './providers/index.js'
export type {
  OppxPackageMetadata,
  ProviderPluginManifest,
  OppxPackageInspectResult,
  InstalledProviderEntry,
  InstalledProvidersIndex,
} from './providers/index.js'
export { normalizePreOpenRealtimeQuote, normalizePreOpenRealtimeQuotes, isMissingLivePrice } from './utils/quote-normalize.js'
export { computeIndicators } from './utils/indicators.js'
export { computeChipDistribution, computeLatestChipProfile } from './utils/cyq.js'
export {
  QueryPlanExecutor,
  QUERY_PLANS,
  defaultCacheType,
} from './core/query-plan.js'
export type {
  QueryPlan,
  QueryPlanId,
  QueryPlanStrategy,
  QueryExecutionContext,
} from './core/query-plan.js'
export { executeIntradaySessionsPlan } from './core/query-plan-intraday.js'
