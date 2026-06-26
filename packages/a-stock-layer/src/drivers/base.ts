import { Capability } from '../core/capabilities.js'
import { normalizeCode } from '../utils/helpers.js'

/** Base driver — all aaashare data sources extend this */
export abstract class BaseDriver {
  abstract get name(): string
  abstract get priority(): number
  abstract capabilities(): Capability[]

  supports(cap: Capability) { return this.capabilities().includes(cap) }

  protected normCode(code: string) { return normalizeCode(code) }

  protected isSh(code: string) {
    const c = normalizeCode(code)
    return c.startsWith('6') || c.startsWith('9') || c.startsWith('000')
  }

  protected secFullCode(code: string): string {
    const c = normalizeCode(code)
    if (c.startsWith('399') || (c.startsWith('0') && !c.startsWith('000'))) return `sz${c}`
    if (c.startsWith('000') && parseInt(c, 10) < 1000) return `sh${c}`
    if (c.startsWith('6') || c.startsWith('9')) return `sh${c}`
    return `sz${c}`
  }

  // Optional methods — return null if unsupported
  realtime?(code: string): Promise<unknown[] | null> | unknown[] | null
  batchRealtime?(codes: string[]): Promise<unknown[] | null> | unknown[] | null
  kline?(code: string, period?: string, start?: string, end?: string): Promise<unknown[] | null> | unknown[] | null
  moneyFlow?(code: string): Promise<unknown[] | null> | unknown[] | null
  indexRealtime?(code: string): Promise<unknown[] | null> | unknown[] | null
  indexKline?(code: string, period?: string, start?: string, end?: string): Promise<unknown[] | null> | unknown[] | null
  marketMoneyFlow?(direction?: string): Promise<unknown[] | null> | unknown[] | null
  sectorMoneyFlow?(sectorType?: string): Promise<unknown[] | null> | unknown[] | null
  profile?(code: string): Promise<unknown[] | null> | unknown[] | null
  shareholders?(code: string, reportDate?: string): Promise<unknown[] | null> | unknown[] | null
  financials?(code: string, reportDate?: string, reportType?: string): Promise<unknown[] | null> | unknown[] | null
  news?(code: string, page?: number, pageSize?: number, newsType?: string): Promise<unknown[] | null> | unknown[] | null
  sentiment?(code: string): Promise<unknown[] | null> | unknown[] | null
  dragonTiger?(date?: string): Promise<unknown[] | null> | unknown[] | null
  marginTrade?(code: string): Promise<unknown[] | null> | unknown[] | null
  dividend?(code: string): Promise<unknown[] | null> | unknown[] | null
  stockList?(market?: string): Promise<unknown[] | null> | unknown[] | null
  limitUpdown?(date?: string): Promise<unknown[] | null> | unknown[] | null
  marketBreadth?(date?: string): Promise<unknown[] | null> | unknown[] | null
  globalIndex?(code?: string): Promise<unknown[] | null> | unknown[] | null
  exchangeRate?(pair?: string): Promise<unknown[] | null> | unknown[] | null
  tradeCalendar?(year?: number): Promise<unknown[] | null> | unknown[] | null
  cashFlow?(code: string, reportDate?: string): Promise<unknown[] | null> | unknown[] | null
  indexConstituents?(indexCode: string): Promise<unknown[] | null> | unknown[] | null
  macroIndicator?(indicator?: string): Promise<unknown[] | null> | unknown[] | null
}

/** Map Capability → driver method name */
export const CAP_METHOD: Partial<Record<Capability, string>> = {
  [Capability.STOCK_REALTIME]: 'realtime',
  [Capability.STOCK_KLINE]: 'kline',
  [Capability.STOCK_MONEY_FLOW]: 'moneyFlow',
  [Capability.INDEX_REALTIME]: 'indexRealtime',
  [Capability.INDEX_KLINE]: 'indexKline',
  [Capability.MARKET_MONEY_FLOW]: 'marketMoneyFlow',
  [Capability.SECTOR_MONEY_FLOW]: 'sectorMoneyFlow',
  [Capability.STOCK_PROFILE]: 'profile',
  [Capability.SHAREHOLDER]: 'shareholders',
  [Capability.FINANCIAL_SUMMARY]: 'financials',
  [Capability.NEWS]: 'news',
  [Capability.SENTIMENT]: 'sentiment',
  [Capability.DRAGON_TIGER]: 'dragonTiger',
  [Capability.MARGIN_TRADE]: 'marginTrade',
  [Capability.DIVIDEND]: 'dividend',
  [Capability.STOCK_LIST]: 'stockList',
  [Capability.LIMIT_UPDOWN]: 'limitUpdown',
  [Capability.MARKET_BREADTH]: 'marketBreadth',
  [Capability.GLOBAL_INDEX]: 'globalIndex',
  [Capability.EXCHANGE_RATE]: 'exchangeRate',
  [Capability.TRADE_CALENDAR]: 'tradeCalendar',
  [Capability.CASH_FLOW]: 'cashFlow',
  [Capability.BALANCE_SHEET]: 'balanceSheet',
  [Capability.INCOME_STMT]: 'incomeStatement',
  [Capability.INST_HOLDING]: 'instHolding',
  [Capability.BLOCK_TRADE]: 'blockTrade',
  [Capability.LOCKUP_EXPIRY]: 'lockupExpiry',
  [Capability.SHARE_PLEDGE]: 'sharePledge',
  [Capability.INTRADAY_TICK]: 'intradayTick',
  [Capability.INDEX_CONST]: 'indexConstituents',
  [Capability.INSIDER_TRADE]: 'insiderTrade',
  [Capability.PERF_FORECAST]: 'perfForecast',
  [Capability.IPO_DATA]: 'ipoData',
  [Capability.CONVERTIBLE_BOND]: 'convertibleBonds',
  [Capability.ETF_DATA]: 'etfData',
  [Capability.MANAGER_INFO]: 'managerInfo',
  [Capability.SHAREHOLDER_PLAN]: 'shareholderPlans',
  [Capability.BUYBACK]: 'buyback',
  [Capability.MACRO_INDICATOR]: 'macroIndicator',
  [Capability.MAIN_BUSINESS]: 'mainBusiness',
  [Capability.TOP_CUSTOMER]: 'topCustomerSupplier',
  [Capability.ACTUAL_CONTROLLER]: 'actualController',
  [Capability.SUBSIDIARY]: 'subsidiaries',
  [Capability.RELATED_PARTY]: 'relatedPartyTrades',
  [Capability.RD_INVESTMENT]: 'rdInvestment',
  [Capability.MERGER_ACQUISITION]: 'maEvents',
  [Capability.EMPLOYEE_COMP]: 'employeeComposition',
  [Capability.INSTITUTIONAL_VISIT]: 'institutionalVisits',
  [Capability.PEER_COMPANY]: 'peerCompanies',
}
