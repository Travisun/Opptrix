import type { AssetClass, StockListItem } from '@opptrix/shared'
import { inferCnAssetClassFromSymbol } from '@opptrix/shared'
import { resolveMarket, normalizeRegionalSymbol, normalizeUsSymbol } from '@opptrix/a-stock-layer'
import { normalizeStockCode } from '../utils.js'
import type { InitialEquityMarket } from './instrument-gateway.js'

function canonicalCode(market: InitialEquityMarket, raw: string): string {
  if (market === 'CN') return normalizeStockCode(raw)
  if (market === 'US') return normalizeUsSymbol(raw)
  return normalizeRegionalSymbol('HK', raw)
}

function resolvePersistAssetClass(
  market: InitialEquityMarket,
  item: StockListItem,
  code: string,
  exchange?: string,
): AssetClass {
  const raw = String(item.assetClass ?? '').trim().toUpperCase()
  if (raw === 'ETF' || raw === 'INDEX' || raw === 'EQUITY' || raw === 'FUND') {
    return raw
  }
  if (market === 'CN') return inferCnAssetClassFromSymbol(code, exchange)
  return 'EQUITY'
}

/** 纯函数：Tickflow / 名录行 → 落库字段（单测用；本地标的库灌库已下线） */
export function resolveListRowPersistFields(
  market: InitialEquityMarket,
  item: StockListItem,
  opts?: { exchange?: string | null; industryFallback?: string | null },
): {
  code: string
  market: InitialEquityMarket
  exchange: string | undefined
  assetClass: AssetClass
  name: string
  industry: string | null
} | null {
  const code = canonicalCode(market, item.code)
  if (!code) return null
  const name = String(item.name ?? code).trim()
  const industry = item.industry?.trim() || opts?.industryFallback?.trim() || null
  const exchange = opts?.exchange?.trim().toUpperCase()
    || (market === 'HK' ? 'HK' : market === 'CN'
      ? (item.market === 'SH' || item.market === 'SZ' || item.market === 'BJ'
        ? item.market
        : (resolveMarket(code) ?? undefined))
      : undefined)
  const assetClass = resolvePersistAssetClass(market, item, code, exchange)
  return { code, market, exchange, assetClass, name, industry }
}
