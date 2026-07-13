import { resolveMarket, normalizeRegionalSymbol, normalizeUsSymbol } from '@opptrix/a-stock-layer'
import type { StockListItem } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { detectSt, normalizeStockCode } from '../utils.js'
import type { InitialEquityMarket } from './instrument-gateway.js'

function canonicalCode(market: InitialEquityMarket, raw: string): string {
  if (market === 'CN') return normalizeStockCode(raw)
  if (market === 'US') return normalizeUsSymbol(raw)
  return normalizeRegionalSymbol('HK', raw)
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
  const code = canonicalCode(market, item.code)
  if (!code) return null
  const name = String(item.name ?? code).trim()
  const industry = item.industry?.trim() || options.industryFallback?.trim() || null
  const exchange = options.exchange?.trim().toUpperCase()
    || (market === 'HK' ? 'HK' : market === 'CN' ? (resolveMarket(code) ?? undefined) : undefined)

  store.upsertInstrument({
    code,
    market,
    assetClass: 'EQUITY',
    name,
    exchange,
    status: market === 'CN' && detectSt(name) ? 'st' : 'active',
    extra: industry ? JSON.stringify({ industry }) : null,
  })

  if (market === 'CN') {
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
  store.upsertEtfProfile(code, { code, name, source: 'stockindex' })
  return code
}
