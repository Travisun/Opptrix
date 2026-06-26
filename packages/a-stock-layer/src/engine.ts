import type {
  FinancialSummary, QueryResult, StockKline, StockListItem, StockRealtime,
} from '@ni-k/shared'
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

/** aaashare AshareEngine — multi-driver fallback + cache */
export class AshareEngine {
  readonly registry = new DriverRegistry()
  readonly cache = new Cache()
  private _portfolio?: PortfolioManager

  /** Portfolio trade manager (lazy init) */
  get portfolio() {
    if (!this._portfolio) this._portfolio = new PortfolioManager(this)
    return this._portfolio
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
  realtime(code: string): Promise<QueryResult<StockRealtime[]>> {
    return this.q(Capability.STOCK_REALTIME, 'realtime', false, code)
  }
  batchRealtime(codes: string[]): Promise<QueryResult<StockRealtime[]>> {
    return this.q(Capability.STOCK_REALTIME, 'batchRealtime', false, codes)
  }

  kline(code: string, periodOrCount: number): Promise<QueryResult<StockKline[]>>
  kline(code: string, period?: string, start?: string, end?: string): Promise<QueryResult<StockKline[]>>
  kline(code: string, periodOrCount: string | number = 'daily', start = '', end = '') {
    if (typeof periodOrCount === 'number') {
      return this.query<StockKline>(Capability.STOCK_KLINE, 'kline', 'stock_kline', true, [code, 'daily', '', '', periodOrCount])
    }
    return this.q<StockKline>(Capability.STOCK_KLINE, 'kline', true, code, periodOrCount, start, end)
  }

  moneyFlow(code: string): Promise<QueryResult<MoneyFlow[]>> {
    return this.q(Capability.STOCK_MONEY_FLOW, 'moneyFlow', true, code)
  }
  indexRealtime(code: string): Promise<QueryResult<IndexRealtime[]>> {
    return this.q(Capability.INDEX_REALTIME, 'indexRealtime', false, code)
  }

  indexKline(code: string, periodOrCount: number): Promise<QueryResult<IndexKline[]>>
  indexKline(code: string, period?: string, start?: string, end?: string): Promise<QueryResult<IndexKline[]>>
  indexKline(code: string, periodOrCount: string | number = 'daily', start = '', end = '') {
    if (typeof periodOrCount === 'number') {
      return this.query<IndexKline>(Capability.INDEX_KLINE, 'indexKline', 'index_kline', true, [code, 'daily', '', '', periodOrCount])
    }
    return this.q<IndexKline>(Capability.INDEX_KLINE, 'indexKline', true, code, periodOrCount, start, end)
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
  GubaDriver, CninfoDriver, CsindexDriver, StatsGovDriver,
  registerAllDrivers,
} from './drivers/register.js'
export { computeIndicators } from './utils/indicators.js'
