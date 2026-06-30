import type {
  FinancialSummary, QueryResult, StockKline, StockListItem, StockRealtime,
} from '@opptrix/shared'
import { CACHE_TYPE, Capability } from './core/capabilities.js'
import { Cache } from './core/cache.js'
import { DriverRegistry } from './core/registry.js'
import { CAP_METHOD } from './drivers/base.js'
import { registerAllDrivers } from './drivers/register.js'
import type {
  Dividend, DragonTiger, GlobalIndex, IndexKline, IndexRealtime,
  LimitUpDown, MarketMoneyFlow, MoneyFlow, NewsItem, SectorMoneyFlow,
  SentimentData, StockProfile, TechnicalIndicator,
} from './core/schema.js'
import { computeIndicators } from './utils/indicators.js'
import { PortfolioManager } from './portfolio/manager.js'
import { WatchlistManager } from './watchlist/manager.js'
import { tdxClient } from './tdx/client.js'
import {
  hasIntradaySessionOnDate,
  mergeIntradaySessions,
} from './tdx/intraday.js'
import type { IntradayTrendFetchResult } from './utils/intraday-trends.js'
import { cnTodayString, shouldPreferTodayIntraday } from './utils/market-session.js'
import { isTushareEnabled } from './tushare/config.js'
import { isBse920Code, normalizeCode } from './utils/helpers.js'
import {
  normalizePreOpenRealtimeQuote,
  normalizePreOpenRealtimeQuotes,
} from './utils/quote-normalize.js'

const MINUTE_PERIODS = new Set(['1m', '5m', '15m', '30m', '60m'])

/** aaashare AshareEngine — multi-driver fallback + cache */
export class AshareEngine {
  readonly registry = new DriverRegistry()
  readonly cache = new Cache()
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
    if (autoDiscover) registerAllDrivers(this.registry)
  }

  private async query<T>(
    cap: Capability,
    method: string,
    cacheType: string,
    useCache: boolean,
    args: unknown[],
  ): Promise<QueryResult<T[]>> {
    if (useCache && cacheType) {
      const params = { method, args: JSON.stringify(args) }
      const cached = this.cache.get<T[]>(cacheType, method, params)
      if (cached) return { success: true, data: cached, source: 'cache', cached: true }
    }

    const drivers = this.registry.getDriversForCapability(cap)
    if (!drivers.length) {
      return { success: false, error: `没有可用的 driver 支持 [${cap}]` }
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
          this.cache.set(cacheType, data, method, { method, args: JSON.stringify(args) })
        }
        return { success: true, data: data as T[], source: driver.name }
      } catch (e) {
        lastError = `${driver.name}: ${e}`
      }
    }
    return { success: false, error: `所有 driver 均失败: ${lastError}` }
  }

  private q<T>(cap: Capability, method: string, useCache: boolean, ...args: unknown[]) {
    const cacheType = CACHE_TYPE[cap] ?? method
    return this.query<T>(cap, method, cacheType, useCache, args)
  }

  // ── Core market data ──
  realtime(code: string, market?: import('./utils/helpers.js').StockMarket): Promise<QueryResult<StockRealtime[]>> {
    return this.q<StockRealtime>(Capability.STOCK_REALTIME, 'realtime', false, code, market).then(result => {
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
    if (!codes.length) return { success: false, error: 'codes empty' }

    const normalized = codes.map(c => normalizeCode(c))
    const results: StockRealtime[] = []
    const seen = new Set<string>()

    const pushRows = (rows: StockRealtime[] | null | undefined) => {
      if (!rows?.length) return
      for (const row of rows) {
        const key = normalizeCode(row.code)
        if (seen.has(key)) continue
        seen.add(key)
        results.push(normalizePreOpenRealtimeQuote({ ...row, code: key }))
      }
    }

    const tushareEligible = isTushareEnabled()
      ? normalized.filter(c => !isBse920Code(c))
      : []
    if (tushareEligible.length) {
      const viaDriver = await this.q<StockRealtime>(
        Capability.STOCK_REALTIME, 'batchRealtime', false, tushareEligible,
      )
      if (viaDriver.success) pushRows(viaDriver.data)
    }

    const missing = normalized.filter(c => !seen.has(c))
    if (missing.length) {
      try {
        pushRows(await tdxClient.batchRealtime(missing))
      } catch { /* driver fallback */ }
    }

    const stillMissing = normalized.filter(c => !seen.has(c))
    if (stillMissing.length) {
      const viaQ = await this.q<StockRealtime>(
        Capability.STOCK_REALTIME, 'batchRealtime', false, stillMissing, markets,
      )
      if (viaQ.success) pushRows(viaQ.data)
    }

    if (!results.length) return { success: false, error: 'batchRealtime failed' }
    return { success: true, data: results, source: 'mixed', cached: false }
  }

  private async fetchDailyKline(
    code: string,
    count: number,
    startOffset = 0,
    period = 'daily',
    market?: import('./utils/helpers.js').StockMarket,
  ): Promise<QueryResult<StockKline[]>> {
    const want = Math.max(1, count)
    const bse920 = isBse920Code(normalizeCode(code))
    if (isTushareEnabled() && !bse920) {
      const viaDriver = await this.query<StockKline>(
        Capability.STOCK_KLINE, 'kline', 'stock_kline', true,
        [code, period, '', '', want, market],
      )
      if (viaDriver.success && viaDriver.data?.length) return viaDriver
    }
    try {
      const rows = await this.fetchTdxBars(code, period, want, startOffset)
      if (rows?.length) {
        return { success: true, data: rows, source: 'mootdx', cached: false }
      }
    } catch { /* driver fallback */ }
    return this.query<StockKline>(
      Capability.STOCK_KLINE, 'kline', 'stock_kline', true,
      [code, period, '', '', want, market],
    )
  }

  /** TDX bars — paginate when count > 800. */
  private async fetchTdxBars(
    code: string,
    period: string,
    count: number,
    startOffset = 0,
  ): Promise<StockKline[] | null> {
    if (count <= 800) {
      return tdxClient.kline(code, period, '', '', count, startOffset)
    }
    const chunks: StockKline[] = []
    let remaining = count
    let offset = startOffset
    while (remaining > 0) {
      const n = Math.min(800, remaining)
      const part = await tdxClient.kline(code, period, '', '', n, offset)
      if (!part?.length) break
      chunks.unshift(...part)
      remaining -= part.length
      offset += part.length
      if (part.length < n) break
    }
    if (!chunks.length) return null
    chunks.sort((a, b) => a.date.localeCompare(b.date))
    return chunks.slice(-count)
  }

  /** Minute OHLC — TDX primary, EastMoney fallback when TDX unavailable. */
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
    try {
      const tdxRows = await tdxClient.kline(code, period, '', '', count, startOffset)
      if (tdxRows?.length) {
        return { success: true, data: tdxRows, source: 'mootdx', cached: false }
      }
    } catch { /* EastMoney fallback */ }

    return this.eastmoneyMinuteFallback(code, period, count, startOffset, market)
  }

  /** 东财备选：1m 用 trends2+当日 kline，其余分钟周期走 kline API。 */
  private async eastmoneyMinuteFallback(
    code: string,
    period: string,
    count: number,
    startOffset = 0,
    market?: import('./utils/helpers.js').StockMarket,
  ): Promise<QueryResult<StockKline[]>> {
    const window = Math.min(count + startOffset, 800)
    if (period === '1m') return this.eastmoney1mFallback(code, window, market)
    return this.query<StockKline>(
      Capability.STOCK_KLINE, 'kline', 'stock_kline', true, [code, period, '', '', window, market],
    )
  }

  /** EastMoney 1m fallback when TDX offline — trends2 历史 + kline 当日。 */
  private async eastmoney1mFallback(
    code: string,
    count: number,
    market?: import('./utils/helpers.js').StockMarket,
  ): Promise<QueryResult<StockKline[]>> {
    const ndays = Math.min(5, Math.max(1, Math.ceil(count / 240)))
    const trendR = await this.minuteTrendKline(code, ndays, 0, market)
    if (!trendR.success || !trendR.data?.length) {
      return this.query<StockKline>(
        Capability.STOCK_KLINE, 'kline', 'stock_kline', true, [code, '1m', '', '', count, market],
      )
    }
    const klineR = await this.query<StockKline>(
      Capability.STOCK_KLINE, 'kline', 'stock_kline', true, [code, '1m', '', '', 240, market],
    )
    let merged = trendR.data
    if (klineR.success && klineR.data?.length) {
      const latestDay = klineR.data[klineR.data.length - 1].date.slice(0, 10)
      merged = [
        ...trendR.data.filter(b => b.date.slice(0, 10) < latestDay),
        ...klineR.data,
      ]
    }
    return {
      success: true,
      data: merged.slice(-Math.min(count, 800)),
      source: trendR.source ?? 'eastmoney',
      cached: trendR.cached,
    }
  }

  /** 1-minute multi-day history (EastMoney trends2 fallback; up to 5 sessions). */
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

  private async fetchIndexKline(
    code: string,
    count: number,
    period = 'daily',
  ): Promise<QueryResult<IndexKline[]>> {
    const want = Math.max(1, count)
    if (isTushareEnabled()) {
      const viaDriver = await this.query<IndexKline>(
        Capability.INDEX_KLINE, 'indexKline', 'index_kline', true,
        [code, period, '', '', want],
      )
      if (viaDriver.success && viaDriver.data?.length) return viaDriver
    }
    try {
      const rows = await tdxClient.indexKline(code, period, '', '', want)
      if (rows?.length) return { success: true, data: rows, source: 'mootdx', cached: false }
    } catch { /* driver fallback */ }
    return this.query<IndexKline>(
      Capability.INDEX_KLINE, 'indexKline', 'index_kline', true,
      [code, period, '', '', want],
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

  /** Multi-day intraday — TDX history + EastMoney today on trading days. */
  async fetchIntradaySessions(
    code: string,
    ndays = 5,
    market?: import('./utils/helpers.js').StockMarket,
  ) {
    const today = cnTodayString()
    const preferToday = shouldPreferTodayIntraday()

    let tdx: IntradayTrendFetchResult | null = null
    try {
      tdx = await tdxClient.fetchIntradaySessions(code, ndays, market)
    } catch { /* EastMoney supplement */ }

    const em = await this.fetchEastmoneyIntradaySessions(code, ndays, market)

    if (preferToday && em && hasIntradaySessionOnDate(em.sessions, today)) {
      const emToday = em.sessions.find(row => row.sessionDate === today)!
      const tdxHistory = (tdx?.sessions ?? []).filter(row => row.sessionDate !== today)
      const merged = mergeIntradaySessions(
        [...tdxHistory, emToday],
        em.apiPreClose ?? tdx?.apiPreClose ?? null,
      )
      if (merged.sessions.length) {
        const source = hasIntradaySessionOnDate(tdx?.sessions ?? [], today) ? 'mootdx' : 'eastmoney'
        return { success: true as const, data: merged, source }
      }
    }

    if (tdx?.sessions.length) {
      return { success: true as const, data: tdx, source: 'mootdx' }
    }
    if (em?.sessions.length) {
      return { success: true as const, data: em, source: 'eastmoney' }
    }
    return { success: false as const, error: '分时数据获取失败' }
  }

  private async fetchEastmoneyIntradaySessions(
    code: string,
    ndays = 5,
    market?: import('./utils/helpers.js').StockMarket,
  ): Promise<IntradayTrendFetchResult | null> {
    const drivers = this.registry.getDriversForCapability(Capability.INTRADAY_TICK)
    for (const driver of drivers) {
      const fn = (driver as { fetchIntradaySessions?: (c: string, n?: number, m?: 'SH' | 'SZ' | 'BJ') => Promise<unknown> })
        .fetchIntradaySessions
      if (typeof fn !== 'function') continue
      try {
        const data = await fn.call(driver, code, ndays, market)
        if (data && typeof data === 'object' && 'sessions' in data) {
          const sessions = (data as IntradayTrendFetchResult).sessions
          if (sessions?.length) return data as IntradayTrendFetchResult
        }
      } catch {
        /* try next driver */
      }
    }
    return null
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
  etfData(etfCode = ''): Promise<QueryResult<Record<string, unknown>[]>> {
    return this.q(Capability.ETF_DATA, 'etfData', true, etfCode)
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
  cacheStats() { return this.cache.stats() }
  listDrivers() { return this.registry.listDriverInfo() }
  registerDriver(driver: Parameters<DriverRegistry['register']>[0]) { this.registry.register(driver) }
  unregisterDriver(name: string) { this.registry.unregister(name) }
}

export { Capability, CACHE_TYPE } from './core/capabilities.js'
export { DriverRegistry } from './core/registry.js'
export { Cache } from './core/cache.js'
export * from './core/schema.js'
export { BaseDriver, CAP_METHOD } from './drivers/base.js'
export {
  EastMoneyDriver, EfinanceDriver, MootdxDriver, PytdxDriver, TencentDriver,
  SinaDriver, TonghuashunDriver, NeteaseDriver, XueqiuDriver,
  GubaDriver, CninfoDriver, CsindexDriver, StatsGovDriver, TushareDriver,
  registerAllDrivers,
} from './drivers/register.js'
export { normalizePreOpenRealtimeQuote, normalizePreOpenRealtimeQuotes, isMissingLivePrice } from './utils/quote-normalize.js'
export { computeIndicators } from './utils/indicators.js'
export { computeChipDistribution, computeLatestChipProfile } from './utils/cyq.js'
