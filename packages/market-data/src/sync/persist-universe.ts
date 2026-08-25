import { resolveMarket, normalizeRegionalSymbol, normalizeUsSymbol } from '@opptrix/a-stock-layer'
import type { AssetClass, StockListItem } from '@opptrix/shared'
import { inferCnAssetClassFromSymbol } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { detectSt, normalizeStockCode } from '../utils.js'
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

/** 纯函数：Tickflow / 名录行 → 落库字段（便于单测，不写库） */
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

export function persistListRow(
  store: MarketDataStore,
  market: InitialEquityMarket,
  item: StockListItem,
  opts?: string | null | { industryFallback?: string | null; exchange?: string | null },
): string | null {
  const options = typeof opts === 'object' && opts != null
    ? opts
    : { industryFallback: opts ?? null }
  const fields = resolveListRowPersistFields(market, item, options)
  if (!fields) return null
  const { code, exchange, assetClass, name, industry } = fields

  if (market === 'CN' && assetClass === 'ETF') {
    return persistCnEtfRow(store, { ...item, code, name }, exchange)
  }

  store.upsertInstrument({
    code,
    market,
    assetClass,
    name,
    exchange,
    status: market === 'CN' && detectSt(name) ? 'st' : 'active',
    extra: industry ? JSON.stringify({ industry }) : null,
  })

  if (market === 'CN' && assetClass === 'EQUITY') {
    store.upsertStock({
      code,
      name,
      market: resolveMarket(code),
      industry,
      is_st: detectSt(name),
      status: detectSt(name) ? 'st' : 'active',
    })
  }

  return code
}

export function persistCnEquityListRow(
  store: MarketDataStore,
  item: StockListItem,
  industryFallback?: string | null,
): string | null {
  return persistListRow(store, 'CN', item, industryFallback)
}

export function persistCnEtfRow(
  store: MarketDataStore,
  item: StockListItem,
  exchange?: string | null,
): string | null {
  const code = normalizeStockCode(item.code)
  if (!code) return null
  const name = String(item.name ?? code).trim()
  const ex = exchange?.trim().toUpperCase() || resolveMarket(code) || undefined
  store.upsertInstrument({
    code,
    market: 'CN',
    assetClass: 'ETF',
    name,
    exchange: ex,
    status: 'active',
    extra: item.industry?.trim() ? JSON.stringify({ industry: item.industry.trim() }) : null,
  })
  store.upsertEtfProfile(code, { code, name, source: 'tickflow' })
  return code
}
