import type { InstrumentRef, Market, StockListItem } from '@opptrix/shared'
import {
  inferCnAssetClassFromSymbol,
  instrumentRefLabel,
  normalizeInstrumentRef,
} from '@opptrix/shared'
import type { StockIndexItem } from './api/client.js'

function cnExchangeFromInstrumentId(instrumentId: string): 'SH' | 'SZ' | 'BJ' | undefined {
  const m = instrumentId.match(/^CN:(SH|SZ|BJ)\./i)
  return m ? m[1]!.toUpperCase() as 'SH' | 'SZ' | 'BJ' : undefined
}

export function stockIndexItemToInstrumentRef(item: StockIndexItem): InstrumentRef | null {
  const market = String(item.market ?? '').toUpperCase() as Market
  const code = String(item.code ?? '').trim()
  if (!code) return null

  if (market === 'CN') {
    const exchange = item.exchange?.toUpperCase()
      ?? cnExchangeFromInstrumentId(item.instrumentId)
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: item.assetType === 'etf' ? 'ETF' : inferCnAssetClassFromSymbol(code),
      symbol: code,
      exchange: exchange as InstrumentRef['exchange'],
    })
  }

  if (market === 'US' || market === 'HK') {
    return normalizeInstrumentRef({
      market,
      assetClass: 'EQUITY',
      symbol: code,
      exchange: item.exchange ?? (market === 'HK' ? 'HK' : undefined),
    })
  }

  return null
}

export function refLabelFromInstrument(ref: InstrumentRef): string {
  return instrumentRefLabel(ref)
}

export function stockIndexItemToListRow(item: StockIndexItem): StockListItem | null {
  const ref = stockIndexItemToInstrumentRef(item)
  if (!ref) return null
  return {
    code: ref.market === 'CN' ? ref.symbol : ref.symbol,
    name: item.nameCn ?? item.code,
    industry: item.industryName ?? '',
    market: ref.market,
  }
}

export function stockIndexItemsToListRows(items: StockIndexItem[]): StockListItem[] {
  const out: StockListItem[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const row = stockIndexItemToListRow(item)
    if (!row) continue
    const key = `${row.market}:${row.code}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

export function parseStockIndexMarket(raw: string | undefined): Market | undefined {
  const m = String(raw ?? '').trim().toUpperCase()
  if (m === 'CN' || m === 'US' || m === 'HK') return m
  return undefined
}
