/**
 * 标的查询计划路由 — 根据 InstrumentRef + 数据能力，解析为具体的 Engine 执行计划。
 *
 * 用途：Agent/Hub 层调用时，将"我要查 AAPL 的 K 线"转化为具体的 Provider 调用路径。
 * 支持市场：CN（A股）、US（美股）、HK（港股）、JP（日股）、KR（韩股）、CRYPTO（加密货币）
 */

import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import { instrumentDisplayCode } from '@opptrix/shared'
import { Capability } from './capabilities.js'
import { isCnEtfCode } from './instrument.js'
import { isRegionalEquityMarket, type RegionalEquityMarket } from '../utils/regional-symbol.js'
import { normalizeUsSymbol } from '../utils/us-market.js'
import { normalizeCode } from '../utils/helpers.js'

/**
 * 标的数据能力 — 定义可查询的数据类型。
 * - realtime:   实时/最新行情
 * - kline:      K 线历史数据
 * - snapshot:   聚合快照（概况 + 行情 + 近期 K 线）
 * - profile:    公司基本面资料
 * - financials: 财务报表数据
 * - stock_list: 股票列表（支持关键词搜索）
 */
export type InstrumentDataCapability =
  | 'realtime'
  | 'kline'
  | 'snapshot'
  | 'profile'
  | 'financials'
  | 'stock_list'

/**
 * 标的查询可选参数 — 控制返回数量、关键词、报告日期/类型、周期等。
 */
export interface InstrumentQueryOpts {
  /** 返回数据条数（如 K 线根数），默认 120 */
  count?: number
  /** 搜索关键词（用于 stock_list 能力） */
  keyword?: string
  /** 财务报告截止日期 YYYY-MM-DD（用于 financials 能力） */
  reportDate?: string
  /** 报告类型："annual"（年报）或 "quarter"（季报），默认 annual */
  reportType?: string
  /** K 线周期："daily"、"weekly"、"monthly"、"1m" 等，默认 daily */
  period?: string
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
  }
  | {
    /** 跨市场复合快照（聚合多维度数据） */
    kind: 'composite_snapshot'
    market: Market
    symbol: string
  }
  | {
    /** A 股实时行情专用路径 */
    kind: 'cn_realtime'
    symbol: string
  }
  | {
    /** A 股 K 线专用路径 */
    kind: 'cn_kline'
    symbol: string
    count: number
    period?: string
  }

// ── 内部辅助函数 ──

function cnAssetClass(ref: InstrumentRef): AssetClass {
  if (ref.assetClass === 'ETF' || isCnEtfCode(ref.symbol)) return 'ETF'
  if (ref.assetClass === 'INDEX') return 'INDEX'
  return 'EQUITY'
}

function cnSymbol(ref: InstrumentRef): string {
  return normalizeCode(ref.symbol)
}

function usSymbol(ref: InstrumentRef): string {
  return normalizeUsSymbol(ref.symbol)
}

function cryptoPair(ref: InstrumentRef): string {
  return instrumentDisplayCode(ref)
}

function registryPlan(
  market: Market,
  assetClass: AssetClass,
  capability: Capability,
  method: string,
  useCache: boolean,
  args: unknown[],
): InstrumentQueryPlan {
  return { kind: 'registry', market, assetClass, capability, method, useCache, args }
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
    const symbol = cnSymbol(ref)
    const assetClass = cnAssetClass(ref)
    switch (dataCap) {
      case 'realtime':
        return { kind: 'cn_realtime', symbol }
      case 'kline':
        return { kind: 'cn_kline', symbol, count, period: opts.period ?? 'daily' }
      case 'snapshot':
        return { kind: 'cn_realtime', symbol }
      case 'profile':
        return registryPlan('CN', assetClass, Capability.STOCK_PROFILE, 'profile', true, [symbol])
      case 'financials':
        return registryPlan('CN', assetClass, Capability.FINANCIAL_SUMMARY, 'financials', true, [
          symbol, opts.reportDate ?? '', opts.reportType ?? 'annual',
        ])
      case 'stock_list':
        return registryPlan('CN', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, [opts.keyword ?? ''])
      default:
        return null
    }
  }

  // ── 美股市场 ──
  if (ref.market === 'US' && ref.assetClass === 'EQUITY') {
    const sym = usSymbol(ref)
    switch (dataCap) {
      case 'realtime':
        return registryPlan('US', 'EQUITY', Capability.STOCK_REALTIME, 'realtime', true, [sym])
      case 'kline':
        return registryPlan('US', 'EQUITY', Capability.STOCK_KLINE, 'kline', true, [
          sym, 'daily', '', '', count,
        ])
      case 'snapshot':
        return { kind: 'composite_snapshot', market: 'US', symbol: sym }
      case 'profile':
        return registryPlan('US', 'EQUITY', Capability.STOCK_PROFILE, 'profile', true, [sym])
      case 'financials':
        return registryPlan('US', 'EQUITY', Capability.FINANCIAL_SUMMARY, 'financials', true, [
          sym, opts.reportDate ?? '', opts.reportType ?? 'annual',
        ])
      case 'stock_list':
        return registryPlan('US', 'EQUITY', Capability.STOCK_LIST, 'stockList', true, ['US', opts.keyword ?? ''])
      default:
        return null
    }
  }

  // ── 区域市场（HK/JP/KR 等） ──
  if (isRegionalEquityMarket(ref.market)) {
    const market = ref.market as RegionalEquityMarket
    const sym = ref.symbol.trim()
    switch (dataCap) {
      case 'realtime':
        return registryPlan(market, 'EQUITY', Capability.STOCK_REALTIME, 'realtime', true, [sym])
      case 'kline':
        return registryPlan(market, 'EQUITY', Capability.STOCK_KLINE, 'kline', true, [
          sym, 'daily', '', '', count,
        ])
      case 'snapshot':
        return { kind: 'composite_snapshot', market, symbol: sym }
      case 'stock_list':
        return registryPlan(market, 'EQUITY', Capability.STOCK_LIST, 'stockList', true, [market, opts.keyword ?? ''])
      default:
        return null
    }
  }

  // ── 加密货币市场 ──
  if (ref.market === 'CRYPTO') {
    const pair = cryptoPair(ref)
    switch (dataCap) {
      case 'realtime':
        return registryPlan('CRYPTO', 'CRYPTO_SPOT', Capability.STOCK_REALTIME, 'realtime', true, [pair])
      case 'kline':
        return registryPlan('CRYPTO', 'CRYPTO_SPOT', Capability.STOCK_KLINE, 'kline', true, [
          pair, 'daily', '', '', count,
        ])
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
