import type {
  FinancialSummary, QueryResult, StockKline, StockListItem, StockRealtime,
} from '@opptrix/shared'
import { CACHE_TYPE, Capability } from './core/capabilities.js'
import { Cache } from './core/cache.js'
import { DriverRegistry } from './core/registry.js'
import { CAP_METHOD } from './providers/common/base.js'
import { createProviderLoader, type ProviderLoader } from './providers/loader.js'
import { ProviderDirWatcher } from './providers/provider-dir-watcher.js'
import { getProviderConfigStore } from './providers/config-store.js'
import { createProviderCatalog, ProviderCatalogService } from './providers/catalog.js'
import { isCnEtfCode } from './core/instrument.js'
import { QueryPlanExecutor, defaultCacheType } from './core/query-plan.js'
import { executeIntradaySessionsPlan } from './core/query-plan-intraday.js'
import { normalizeUsSymbol } from './utils/us-market.js'
import { isRegionalEquityMarket, type RegionalEquityMarket } from './utils/regional-symbol.js'
import { parseCryptoPair } from './utils/crypto-market.js'
import type { AssetClass, Market, InstrumentRef } from '@opptrix/shared'
import {
  resolveInstrumentQueryPlan,
  unsupportedInstrumentCapabilityMessage,
  type InstrumentDataCapability,
} from './core/instrument-query.js'
import type {
  Dividend, DragonTiger, GlobalIndex, IndexKline, IndexRealtime,
  LimitUpDown, MarketMoneyFlow, MoneyFlow, NewsItem, SectorMoneyFlow,
  SentimentData, StockProfile, TechnicalIndicator,
} from './core/schema.js'
import { computeIndicators } from './utils/indicators.js'
import { PortfolioManager } from './portfolio/manager.js'
import { WatchlistManager } from './watchlist/manager.js'
import { normalizeCode } from './utils/helpers.js'
import {
  normalizePreOpenRealtimeQuote,
  normalizePreOpenRealtimeQuotes,
} from './utils/quote-normalize.js'

const MINUTE_PERIODS = new Set(['1m', '5m', '15m', '30m', '60m'])

export type { InstrumentDataCapability } from './core/instrument-query.js'

/** Multi-market data engine — provider fallback + cache (canonical name: MarketDataEngine) */
export class MarketDataEngine {
  readonly registry = new DriverRegistry()
  readonly cache = new Cache()
  readonly providerCatalog: ProviderCatalogService
  readonly providerLoader: ProviderLoader
  private readonly queryPlans: QueryPlanExecutor
  private providerDirWatcher?: ProviderDirWatcher
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
        .then(() => this.startProviderDirWatcher())
        .catch(err => {
          console.warn('[MarketDataEngine] loadInstalled failed:', err)
          this.startProviderDirWatcher()
        })
    }
    this.registry.refreshPriorities(configStore)
    this.providerCatalog = createProviderCatalog(this.registry)
    this.queryPlans = new QueryPlanExecutor(this.registry, this.cache)
  }

  private async queryScoped<T>(
    market: Market,
    assetClass: AssetClass,
    cap: Capability,
    method: string,
    cacheType: string,
    useCache: boolean,
    args: unknown[],
  ): Promise<QueryResult<T[]>> {
    if (useCache && cacheType) {
      const params = { method, market, assetClass, args: JSON.stringify(args) }
      const cached = this.cache.get<T[]>(cacheType, method, params)
      if (cached) return { success: true, data: cached, source: 'cache', cached: true }
    }

    const drivers = this.registry.getProvidersWithFallback(market, assetClass, cap)
    if (!drivers.length) {
      return { success: false, error: `没有可用的 provider 支持 [${market}/${assetClass}/${cap}]` }
    }

    let lastError = ''
    for (const driver of drivers) {
      const fn = (driver as unknown as Record<string, unknown>)[method] as
        ((...a: unknown[]) => Promise<unknown[] | null> | unknown[] | null) | undefined
      if (!fn) continue
      try {
        const data = await fn.apply(driver, args)
        if (!data?.length) continue
        if (useCache && cacheType) {
          this.cache.set(cacheType, data, method, { method, market, assetClass, args: JSON.stringify(args) }, driver.name)
        }
        return { success: true, data: data as T[], source: driver.name }
      } catch (e) {
        lastError = `${driver.name}: ${e}`
      }
    }
    return { success: false, error: `所有 provider 均失败: ${lastError}` }
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
  realtime(code: string, market?: import('./utils/helpers.js').StockMarket): Promise<QueryResult<StockRealtime[]>> {
    const assetClass = isCnEtfCode(code) ? 'ETF' : 'EQUITY'
    return this.qScoped<StockRealtime>('CN', assetClass, Capability.STOCK_REALTIME, 'realtime', false, code, market).then(result => {
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
  ): Promise<QueryResult<StockKline[]>>
  kline(
    code: string,
    periodOrCount: string | number = 'daily',
    start = '',
    end = '',
    count?: number,
    market?: import('./utils/helpers.js').StockMarket,
  ) {
    if (typeof periodOrCount === 'number') {
      return this.fetchDailyKline(code, periodOrCount, 0, 'daily', market)
    }
    if (MINUTE_PERIODS.has(periodOrCount)) {
      return this.minuteKline(code, periodOrCount, count ?? 800, 0, market)
    }
    if (periodOrCount === 'daily' || periodOrCount === 'weekly' || periodOrCount === 'monthly') {
      return this.fetchDailyKline(code, count ?? 800, 0, periodOrCount, market)
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
  ): Promise<QueryResult<StockKline[]>> {
    const want = Math.max(1, count)
    const assetClass = isCnEtfCode(code) ? 'ETF' : 'EQUITY'
    return this.queryPlans.execute<StockKline>(
      this.queryPlans.getPlan('cn_equity_stock_kline_daily'),
      {
        method: 'kline',
        cacheType: defaultCacheType(Capability.STOCK_KLINE, 'stock_kline'),
        useCache: true,
        args: [code, period, '', '', want, market, startOffset],
        assetClass,
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
  ): Promise<QueryResult<StockKline[]>> {
    const safeCount = Math.max(1, Math.min(count, 800))
    const safeOffset = Math.max(0, startOffset)
    return this.fetchMinuteKline(code, period, safeCount, safeOffset, market)
  }

  private async fetchMinuteKline(
    code: string,
    period: string,
    count: number,
    startOffset: number,
    market?: import('./utils/helpers.js').StockMarket,
  ): Promise<QueryResult<StockKline[]>> {
    const assetClass = isCnEtfCode(code) ? 'ETF' : 'EQUITY'
    const viaPlan = await this.queryPlans.execute<StockKline>(
      this.queryPlans.getPlan('cn_equity_stock_kline_minute'),
      {
        method: 'kline',
        cacheType: defaultCacheType(Capability.STOCK_KLINE, 'stock_kline'),
        useCache: true,
        args: [code, period, '', '', count, market, startOffset],
        assetClass,
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
    return this.q(Capability.INDEX_REALTIME, 'indexRealtime', false, code)
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
    return this.query<IndexKline>(Capability.INDEX_KLINE, 'indexKline', 'index_kline', true, args)
  }

  private fetchIndexKline(
    code: string,
    count: number,
    period = 'daily',
  ): Promise<QueryResult<IndexKline[]>> {
    const want = Math.max(1, count)
    return this.queryPlans.execute<IndexKline>(
      this.queryPlans.getPlan('cn_index_index_kline'),
      {
        method: 'indexKline',
        cacheType: defaultCacheType(Capability.INDEX_KLINE, 'index_kline'),
        useCache: true,
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

  async etfSnapshot(etfCode: string) {
    const code = normalizeCode(etfCode)
    const [profile, nav, quote] = await Promise.all([
      this.etfProfile(code),
      this.etfNav(code),
      this.realtime(code),
    ])
    return {
      success: profile.success || nav.success || quote.success,
      data: {
        code,
        profile: profile.data?.[0] ?? null,
        nav: nav.data?.[0] ?? null,
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

  /** @deprecated Prefer `queryInstrumentData({ market, ... }, 'snapshot')` */
  async regionalSnapshot(market: RegionalEquityMarket, symbol: string) {
    const [quote, klines] = await Promise.all([
      this.regionalRealtime(market, symbol),
      this.regionalKline(market, symbol, 10),
    ])
    return {
      success: quote.success || klines.success,
      data: {
        code: symbol,
        profile: null,
        quote: quote.data?.[0] ?? null,
        recentKlines: klines.data ?? [],
      },
      source: quote.source ?? klines.source,
    }
  }

  /** DataEngine 收敛入口 — 按 InstrumentRef + capability 经 Registry 路由 */
  queryInstrumentData(
    ref: InstrumentRef,
    capability: InstrumentDataCapability,
    opts?: {
      count?: number
      keyword?: string
      reportDate?: string
      reportType?: string
      period?: string
    },
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
        return this.realtime(plan.symbol)
      case 'cn_kline':
        if (plan.period && plan.period !== 'daily') {
          return this.kline(plan.symbol, plan.period, '', '', plan.count)
        }
        return this.kline(plan.symbol, plan.count)
      case 'composite_snapshot':
        if (plan.market === 'US') return this.usSnapshot(plan.symbol)
        if (plan.market === 'CRYPTO') return this.cryptoSnapshot(plan.symbol)
        if (isRegionalEquityMarket(plan.market)) {
          return this.regionalSnapshot(plan.market, plan.symbol)
        }
        return Promise.resolve({ success: false, error: `不支持 snapshot: ${plan.market}` })
      case 'registry':
        return this.qScoped(
          plan.market,
          plan.assetClass,
          plan.capability,
          plan.method,
          plan.useCache,
          ...plan.args,
        )
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
  private async onProvidersDirChanged() {
    const prev = new Set(this.providerLoader.listInstalled().map(r => r.providerId))
    await this.providerLoader.rescan()
    const touched = new Set([...prev, ...this.providerLoader.listInstalled().map(r => r.providerId)])
    for (const id of touched) this.clearCacheForProvider(id)
  }
  private startProviderDirWatcher() {
    if (this.providerDirWatcher) return
    this.providerDirWatcher = new ProviderDirWatcher(() => this.onProvidersDirChanged())
    this.providerDirWatcher.start()
  }
  stopProviderDirWatcher() {
    this.providerDirWatcher?.stop()
    this.providerDirWatcher = undefined
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
  reorderProviderMarketGroup(marketGroup: string, providerIds: string[]) {
    const result = this.providerCatalog.reorderMarketGroup(marketGroup, providerIds)
    for (const id of providerIds) this.clearCacheForProvider(id)
    return result
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
}

export { MarketDataEngine as AshareEngine }

export { DriverRegistry } from './core/registry.js'
export { Capability, CACHE_TYPE } from './core/capabilities.js'
export { Cache, DEFAULT_TTL } from './core/cache.js'
export * from './core/schema.js'
export { BaseDriver, CAP_METHOD } from './providers/common/base.js'
export {
  TushareDriver,
  TickflowDriver,
  BinanceDriver,
  OkxDriver,
  BaostockDriver,
  ZzshareDriver,
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
export { fetchTdxKlinePaginated } from './providers/tdx/kline-paginate.js'
