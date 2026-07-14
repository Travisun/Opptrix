/**
 * 标的查询计划路由 — 根据 InstrumentRef + 数据能力，解析为具体的 Engine 执行计划。
 *
 * 用途：Agent/Hub 层调用时，将"我要查 AAPL 的 K 线"转化为具体的 Provider 调用路径。
 * 支持市场：CN（A股）、US（美股）、HK（港股）、CRYPTO（加密货币）；JP/KR 暂不接入标准 API。
 */

import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import { instrumentProviderSymbol, normalizeInstrumentRef } from '@opptrix/shared'
import { Capability } from './capabilities.js'
import { isCnEtfCode } from './instrument.js'
import { isRegionalEquityMarket, type RegionalEquityMarket } from '../utils/regional-symbol.js'

/**
 * 标的数据能力 — 定义可查询的数据类型（标准 Instrument API）。
 *
 * 未列入本类型的 Provider 方法须登记为自定义方法，经
 * `list_provider_custom_methods` / `invoke_provider_custom_method` 调用。
 *
 * - realtime:       实时/最新行情
 * - kline:          K 线历史数据
 * - snapshot:       聚合快照（概况 + 行情 + 近期 K 线）
 * - profile:        公司/基金基本面资料
 * - financials:     财务摘要（营收/利润/ROE 等）
 * - balance_sheet:  资产负债表多期
 * - cash_flow:      现金流量表多期
 * - stock_list:         股票列表（分页、板块过滤）
 * - instrument_search:  跨市场关键词搜索（相关性排序）
 * - sector_list:        板块/行业列表
 * - etf_list:       ETF 列表（支持关键词）
 * - etf_profile:    ETF 基本面资料
 * - etf_nav:        ETF 净值序列
 * - etf_holdings:   ETF 持仓成分
 * - etf_snapshot:   ETF 聚合快照（概况 + 净值 + 行情）
 * - dividend:       分红送转记录
 * - news:           个股资讯/新闻
 * - notices:        公司公告（news 的 notice 通道）
 * - shareholders:   股东结构/持仓统计
 * - money_flow:     个股资金流向
 * - technical_analysis: 技术面摘要（港股成交分布等）
 */
export type InstrumentDataCapability =
  | 'realtime'
  | 'kline'
  | 'snapshot'
  | 'profile'
  | 'financials'
  | 'balance_sheet'
  | 'cash_flow'
  | 'stock_list'
  | 'instrument_search'
  | 'sector_list'
  | 'etf_list'
  | 'etf_profile'
  | 'etf_nav'
  | 'etf_holdings'
  | 'etf_snapshot'
  | 'dividend'
  | 'news'
  | 'notices'
  | 'shareholders'
  | 'money_flow'
  | 'technical_analysis'

/**
 * 标的查询可选参数 — 控制返回数量、关键词、报告日期/类型、周期等。
 */
export interface InstrumentQueryOpts {
  /** 返回数据条数（如 K 线根数），默认 120 */
  count?: number
  /** 搜索关键词（用于 stock_list / instrument_search） */
  keyword?: string
  /** 财务报告截止日期 YYYY-MM-DD（用于 financials / balance_sheet / cash_flow） */
  reportDate?: string
  /** 报告类型："annual"（年报）或 "quarter"（季报），默认 annual；摘要能力用 */
  reportType?: string
  /** K 线周期："daily"、"weekly"、"monthly"、"1m" 等，默认 daily */
  period?: string
  /** stock_list 分页 */
  page?: number
  pageSize?: number
  /** stock_list 板块过滤（如 hsj、cyb） */
  boardKey?: string
  /** stock_list 行业代码过滤（A 股） */
  industryCode?: string
  /** sector_list 入参，如 industries:CN、boards:HK */
  plateType?: string
  /** K 线起始日期 YYYY-MM-DD（CN cn_kline） */
  startDate?: string
  /** K 线结束日期 YYYY-MM-DD（CN cn_kline） */
  endDate?: string
  /** news / notices 资讯类型（CN：all|notice|research；US/HK：all|notice） */
  newsType?: string
}

/**
 * 标的查询执行计划 — 根据市场与能力路由到具体执行路径。
 *
 * 路由规则：
 *   - registry:       通过 Provider Registry 标准路由（US/HK/JP/KR 等）
 *   - cn_realtime:    A 股实时行情专用通道（新浪/东财批量接口）
 *   - cn_kline:       A 股 K 线专用通道（BaoStock/自在量化/东财）
 *   - composite_snapshot: 跨市场复合快照（聚合行情 + 公司资料 + 近期 K 线）
 */
export type InstrumentQueryPlan =
  | {
    /** 标准 Registry 路由 */
    kind: 'registry'
    market: Market
    assetClass: AssetClass
    capability: Capability
    /** Provider 上要调用的方法名 */
    method: string
    /** 是否使用缓存 */
    useCache: boolean
    /** 方法参数列表 */
    args: unknown[]
    /** 标的身份 — qScoped 按 Provider 线格式重写 args */
    ref?: InstrumentRef
  }
  | {
    /** 跨市场复合快照（聚合多维度数据） */
    kind: 'composite_snapshot'
    market: Market
    symbol: string
    assetClass?: AssetClass
  }
  | {
    /** A 股实时行情专用路径 */
    kind: 'cn_realtime'
    symbol: string
    exchange?: string
  }
  | {
    /** A 股 K 线专用路径 */
    kind: 'cn_kline'
    symbol: string
    exchange?: string
    count: number
    period?: string
    start?: string
    end?: string
  }

// ── 内部辅助函数 ──

function cnAssetClass(ref: InstrumentRef): AssetClass {
  return normalizeInstrumentRef(ref).assetClass
}

function cnSymbol(ref: InstrumentRef): string {
  return normalizeInstrumentRef(ref).symbol
}

function usSymbol(ref: InstrumentRef): string {
  return normalizeInstrumentRef(ref).symbol
}

function regionalSymbol(ref: InstrumentRef): string {
  return normalizeInstrumentRef(ref).symbol
}

function cryptoPair(ref: InstrumentRef): string {
  return instrumentProviderSymbol(normalizeInstrumentRef(ref))
}

function registryPlan(
  market: Market,
  assetClass: AssetClass,
  capability: Capability,
  method: string,
  useCache: boolean,
  args: unknown[],
  ref?: InstrumentRef,
): InstrumentQueryPlan {
  return { kind: 'registry', market, assetClass, capability, method, useCache, args, ref }
}

function detailNewsPlan(
  market: Market,
  normalized: InstrumentRef,
  symbol: string,
  opts: InstrumentQueryOpts,
  newsType: string,
): InstrumentQueryPlan {
  const page = opts.page ?? 1
  const pageSize = opts.pageSize ?? 20
  return registryPlan(
    market,
    'EQUITY',
    Capability.NEWS,
    'news',
    page <= 2,
    [symbol, page, pageSize, newsType],
    normalized,
  )
}

function instrumentSearchPlan(
  market: Market,
  opts: InstrumentQueryOpts,
): InstrumentQueryPlan | null {
  const keyword = (opts.keyword ?? '').trim()
  if (!keyword) return null
  const limit = Math.min(opts.pageSize ?? 30, 100)
  const args: unknown[] = [keyword, market, limit]
  if (opts.boardKey) args.push(opts.boardKey)
  if (opts.industryCode) args.push(opts.industryCode)
  return registryPlan(market, 'EQUITY', Capability.INSTRUMENT_SEARCH, 'instrumentSearch', true, args)
}

/**
 * 将 InstrumentRef + 数据能力解析为 Engine 执行计划。
 *
 * @param ref    标的引用（含市场、代码、资产类别）
 * @param dataCap 需要的数据能力
 * @param opts   可选查询参数
 * @returns 执行计划，不支持的组合返回 null
 */
export function resolveInstrumentQueryPlan(
  ref: InstrumentRef,
  dataCap: InstrumentDataCapability,
  opts: InstrumentQueryOpts = {},
): InstrumentQueryPlan | null {
  const count = opts.count ?? 120

  // ── A 股市场 ──
  if (ref.market === 'CN') {
    const normalized = normalizeInstrumentRef(ref)
    const symbol = normalized.symbol
    const assetClass = normalized.assetClass
    const exchange = normalized.exchange
    switch (dataCap) {
      case 'realtime':
        return { kind: 'cn_realtime', symbol, exchange }
      case 'kline':
        return {
          kind: 'cn_kline',
          symbol,
          exchange,
          count,
          period: opts.period ?? 'daily',
          start: opts.startDate,
          end: opts.endDate,
        }
      case 'snapshot':
        if (assetClass === 'ETF' || isCnEtfCode(symbol)) {
          return { kind: 'composite_snapshot', market: 'CN', symbol, assetClass: 'ETF' }
        }
        return { kind: 'cn_realtime', symbol, exchange }
      case 'profile':
        if (assetClass === 'ETF' || isCnEtfCode(symbol)) {
          return registryPlan('CN', 'ETF', Capability.ETF_PROFILE, 'etfProfile', true, [symbol], normalized)
        }
        return registryPlan('CN', assetClass, Capability.STOCK_PROFILE, 'profile', true, [symbol], normalized)
      case 'financials':
        return registryPlan('CN', assetClass, Capability.FINANCIAL_SUMMARY, 'financials', true, [
          symbol, opts.reportDate ?? '', opts.reportType ?? 'annual',
        ], normalized)
      case 'balance_sheet':
        return registryPlan('CN', assetClass, Capability.BALANCE_SHEET, 'balanceSheet', true, [
          symbol, opts.reportDate ?? '',
        ], normalized)
      case 'cash_flow':
        return registryPlan('CN', assetClass, Capability.CASH_FLOW, 'cashFlow', true, [
          symbol, opts.reportDate ?? '',
        ], normalized)
      case 'stock_list': {
        const page = opts.page ?? 1
        const pageSize = opts.pageSize ?? 100
        // StockIndex: stockList(marketOrKeyword, keyword, page, pageSize, board?, industry?)
        // 板块/行业成分须走空 keyword + 第 5/6 参；或 keyword=`board:key:CN`
        if (opts.boardKey || opts.industryCode) {
          if (opts.boardKey && !opts.industryCode && !(opts.keyword ?? '').trim()) {
            return registryPlan('CN', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, [
              `board:${opts.boardKey}:CN`, '', page, pageSize,
            ])
          }
          return registryPlan('CN', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, [
            '', '', page, pageSize, opts.boardKey, opts.industryCode,
          ])
        }
        const args: unknown[] = [opts.keyword ?? '']
        if (opts.page != null) args.push(page, pageSize)
        return registryPlan('CN', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, args)
      }
      case 'instrument_search':
        return instrumentSearchPlan('CN', opts)
      case 'sector_list':
        return registryPlan(
          'CN',
          'EQUITY',
          Capability.SECTOR_LIST,
          'sectorList',
          true,
          [opts.plateType ?? 'industries:CN'],
        )
      case 'etf_list':
        if (assetClass === 'ETF' || isCnEtfCode(symbol)) {
          return registryPlan('CN', 'ETF', Capability.ETF_LIST, 'etfList', true, [
            'CN', opts.keyword ?? '',
          ])
        }
        return null
      case 'etf_profile':
        if (assetClass === 'ETF' || isCnEtfCode(symbol)) {
          return registryPlan('CN', 'ETF', Capability.ETF_PROFILE, 'etfProfile', true, [symbol], normalized)
        }
        return null
      case 'etf_nav':
        if (assetClass === 'ETF' || isCnEtfCode(symbol)) {
          return registryPlan('CN', 'ETF', Capability.ETF_NAV, 'etfNav', true, [symbol], normalized)
        }
        return null
      case 'etf_holdings':
        if (assetClass === 'ETF' || isCnEtfCode(symbol)) {
          return registryPlan('CN', 'ETF', Capability.ETF_HOLDINGS, 'etfHoldings', true, [symbol], normalized)
        }
        return null
      case 'etf_snapshot':
        if (assetClass === 'ETF' || isCnEtfCode(symbol)) {
          return { kind: 'composite_snapshot', market: 'CN', symbol, assetClass: 'ETF' }
        }
        return null
      case 'dividend':
        return registryPlan('CN', assetClass, Capability.DIVIDEND, 'dividend', true, [symbol], normalized)
      case 'news':
        return detailNewsPlan('CN', normalized, symbol, opts, opts.newsType ?? 'all')
      case 'notices':
        return detailNewsPlan('CN', normalized, symbol, opts, 'notice')
      case 'shareholders':
        return registryPlan(
          'CN',
          assetClass,
          Capability.SHAREHOLDER,
          'shareholders',
          true,
          [symbol, opts.reportDate ?? ''],
          normalized,
        )
      case 'money_flow':
        return registryPlan('CN', assetClass, Capability.STOCK_MONEY_FLOW, 'moneyFlow', true, [symbol], normalized)
      default:
        return null
    }
  }

  // ── 美股市场 ──
  if (ref.market === 'US' && ref.assetClass === 'EQUITY') {
    const normalized = normalizeInstrumentRef(ref)
    const sym = usSymbol(ref)
    switch (dataCap) {
      case 'realtime':
        return registryPlan('US', 'EQUITY', Capability.STOCK_REALTIME, 'realtime', true, [sym], normalized)
      case 'kline':
        return registryPlan('US', 'EQUITY', Capability.STOCK_KLINE, 'kline', true, [
          sym, opts.period ?? 'daily', opts.startDate ?? '', opts.endDate ?? '', count,
        ], normalized)
      case 'snapshot':
        return { kind: 'composite_snapshot', market: 'US', symbol: sym }
      case 'profile':
        return registryPlan('US', 'EQUITY', Capability.STOCK_PROFILE, 'profile', true, [sym], normalized)
      case 'financials':
        return registryPlan('US', 'EQUITY', Capability.FINANCIAL_SUMMARY, 'financials', true, [
          sym, opts.reportDate ?? '', opts.reportType ?? 'annual',
        ], normalized)
      case 'balance_sheet':
        return registryPlan('US', 'EQUITY', Capability.BALANCE_SHEET, 'balanceSheet', true, [
          sym, opts.reportDate ?? '',
        ], normalized)
      case 'cash_flow':
        return registryPlan('US', 'EQUITY', Capability.CASH_FLOW, 'cashFlow', true, [
          sym, opts.reportDate ?? '',
        ], normalized)
      case 'stock_list': {
        const page = opts.page ?? 1
        const pageSize = opts.pageSize ?? 100
        if (opts.boardKey) {
          return registryPlan('US', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, [
            `board:${opts.boardKey}:US`, '', page, pageSize,
          ])
        }
        const args: unknown[] = ['US', opts.keyword ?? '']
        if (opts.page != null) args.push(page, pageSize)
        return registryPlan('US', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, args)
      }
      case 'instrument_search':
        return instrumentSearchPlan('US', opts)
      case 'sector_list':
        return registryPlan(
          'US',
          'EQUITY',
          Capability.SECTOR_LIST,
          'sectorList',
          true,
          [opts.plateType ?? 'boards:US'],
        )
      case 'news':
        return detailNewsPlan('US', normalized, sym, opts, opts.newsType ?? 'all')
      case 'notices':
        return detailNewsPlan('US', normalized, sym, opts, 'notice')
      case 'shareholders':
        return registryPlan(
          'US',
          'EQUITY',
          Capability.SHAREHOLDER,
          'shareholders',
          true,
          [sym, opts.page ?? 1],
          normalized,
        )
      default:
        return null
    }
  }

  // ── 区域市场（HK；JP/KR 暂不接入） ──
  if (isRegionalEquityMarket(ref.market)) {
    const market = ref.market as RegionalEquityMarket
    if (market === 'JP' || market === 'KR') return null
    const normalized = normalizeInstrumentRef(ref)
    const sym = regionalSymbol(ref)
    switch (dataCap) {
      case 'realtime':
        return registryPlan(market, 'EQUITY', Capability.STOCK_REALTIME, 'realtime', true, [sym], normalized)
      case 'kline':
        return registryPlan(market, 'EQUITY', Capability.STOCK_KLINE, 'kline', true, [
          sym, opts.period ?? 'daily', opts.startDate ?? '', opts.endDate ?? '', count,
        ], normalized)
      case 'snapshot':
        return { kind: 'composite_snapshot', market, symbol: sym }
      case 'profile':
        return registryPlan(market, 'EQUITY', Capability.STOCK_PROFILE, 'profile', true, [sym], normalized)
      case 'stock_list': {
        const page = opts.page ?? 1
        const pageSize = opts.pageSize ?? 100
        if (opts.boardKey) {
          return registryPlan(market, 'EQUITY', Capability.STOCK_LIST, 'stockList', true, [
            `board:${opts.boardKey}:${market}`, '', page, pageSize,
          ])
        }
        const args: unknown[] = [market, opts.keyword ?? '']
        if (opts.page != null) args.push(page, pageSize)
        return registryPlan(market, 'EQUITY', Capability.STOCK_LIST, 'stockList', true, args)
      }
      case 'instrument_search':
        return market === 'HK' ? instrumentSearchPlan('HK', opts) : null
      case 'sector_list':
        return registryPlan(
          market,
          'EQUITY',
          Capability.SECTOR_LIST,
          'sectorList',
          true,
          [opts.plateType ?? `boards:${market}`],
        )
      case 'news':
        return detailNewsPlan(market, normalized, sym, opts, opts.newsType ?? 'all')
      case 'notices':
        return detailNewsPlan(market, normalized, sym, opts, 'notice')
      case 'dividend':
        if (market === 'HK') {
          return registryPlan(
            'HK',
            'EQUITY',
            Capability.DIVIDEND,
            'dividend',
            true,
            [sym, opts.page ?? 1, opts.pageSize ?? 10, true],
            normalized,
          )
        }
        return null
      case 'technical_analysis':
        if (market === 'HK') {
          return registryPlan(
            'HK',
            'EQUITY',
            Capability.TECH_INDICATOR,
            'technicalAnalysis',
            true,
            [sym],
            normalized,
          )
        }
        return null
      default:
        return null
    }
  }

  // ── 加密货币市场 ──
  if (ref.market === 'CRYPTO') {
    const normalized = normalizeInstrumentRef(ref)
    const pair = cryptoPair(ref)
    switch (dataCap) {
      case 'realtime':
        return registryPlan('CRYPTO', 'CRYPTO_SPOT', Capability.STOCK_REALTIME, 'realtime', true, [pair], normalized)
      case 'kline':
        return registryPlan('CRYPTO', 'CRYPTO_SPOT', Capability.STOCK_KLINE, 'kline', true, [
          pair, opts.period ?? 'daily', '', '', count,
        ], normalized)
      case 'snapshot':
        return { kind: 'composite_snapshot', market: 'CRYPTO', symbol: pair }
      case 'stock_list':
        return registryPlan('CRYPTO', 'CRYPTO_SPOT', Capability.STOCK_LIST, 'stockList', true, ['CRYPTO', opts.keyword ?? ''])
      default:
        return null
    }
  }

  return null
}

/**
 * 生成"不支持"提示消息 — 当标的市场/资产类别不支持指定能力时调用。
 */
export function unsupportedInstrumentCapabilityMessage(
  ref: InstrumentRef,
  dataCap: InstrumentDataCapability,
): string {
  return `${ref.market}/${ref.assetClass} 不支持 capability: ${dataCap}`
}
