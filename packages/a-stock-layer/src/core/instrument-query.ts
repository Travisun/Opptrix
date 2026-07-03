import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import { instrumentDisplayCode } from '@opptrix/shared'
import { Capability } from './capabilities.js'
import { isCnEtfCode } from './instrument.js'
import { isRegionalEquityMarket, type RegionalEquityMarket } from '../utils/regional-symbol.js'
import { normalizeUsSymbol } from '../utils/us-market.js'
import { normalizeCode } from '../utils/helpers.js'

/** DataEngine 标准 capability — 与 Provider Registry 路由对齐 */
export type InstrumentDataCapability =
  | 'realtime'
  | 'kline'
  | 'snapshot'
  | 'profile'
  | 'financials'
  | 'stock_list'

export interface InstrumentQueryOpts {
  count?: number
  keyword?: string
  reportDate?: string
  reportType?: string
  period?: string
}

export type InstrumentQueryPlan =
  | {
    kind: 'registry'
    market: Market
    assetClass: AssetClass
    capability: Capability
    method: string
    useCache: boolean
    args: unknown[]
  }
  | {
    kind: 'composite_snapshot'
    market: Market
    symbol: string
  }
  | {
    kind: 'cn_realtime'
    symbol: string
  }
  | {
    kind: 'cn_kline'
    symbol: string
    count: number
    period?: string
  }

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

/** Map InstrumentRef + data capability → Engine execution plan */
export function resolveInstrumentQueryPlan(
  ref: InstrumentRef,
  dataCap: InstrumentDataCapability,
  opts: InstrumentQueryOpts = {},
): InstrumentQueryPlan | null {
  const count = opts.count ?? 120

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

export function unsupportedInstrumentCapabilityMessage(
  ref: InstrumentRef,
  dataCap: InstrumentDataCapability,
): string {
  return `${ref.market}/${ref.assetClass} 不支持 capability: ${dataCap}`
}
