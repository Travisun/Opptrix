import type { InstrumentRef, Market, StockListItem } from '@opptrix/shared'
import {
  canonicalSymbolForMarket,
  inferCnAssetClassFromSymbol,
  instrumentRefLabel,
  normalizeInstrumentRef,
  parseInstrumentNamespace,
} from '@opptrix/shared'
import type { StockIndexItem } from './api/client.js'
import { stockIndexItemLooksLikeCnPublicFund } from '../../core/fund-instrument.js'

function cnExchangeFromInstrumentId(instrumentId: string): 'SH' | 'SZ' | 'BJ' | 'PF' | undefined {
  if (/^CN:(?:PF|OF)\./i.test(instrumentId)) return 'PF'
  const m = instrumentId.match(/^CN:(SH|SZ|BJ)\./i)
  return m ? m[1]!.toUpperCase() as 'SH' | 'SZ' | 'BJ' : undefined
}

export function stockIndexItemToInstrumentRef(item: StockIndexItem): InstrumentRef | null {
  const market = String(item.market ?? '').toUpperCase() as Market
  const code = String(item.code ?? '').trim()
  if (!code) return null

  const instrumentIdStr = String(item.instrumentId ?? '').trim()
  const fromId = instrumentIdStr ? parseInstrumentNamespace(instrumentIdStr) : null

  if (market === 'CN') {
    if (fromId && (fromId.assetClass === 'FUND' || String(fromId.exchange ?? '').toUpperCase() === 'PF')) {
      return normalizeInstrumentRef(fromId)
    }
    if (stockIndexItemLooksLikeCnPublicFund(item)) {
      return normalizeInstrumentRef({
        market: 'CN',
        assetClass: 'FUND',
        symbol: code,
        exchange: 'PF',
      })
    }
    if (fromId) return normalizeInstrumentRef(fromId)
    const exchange = item.exchange?.toUpperCase()
      ?? cnExchangeFromInstrumentId(instrumentIdStr)
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: item.assetType === 'etf' ? 'ETF' : inferCnAssetClassFromSymbol(code, exchange ?? null),
      symbol: code,
      exchange: exchange as InstrumentRef['exchange'],
    })
  }

  if (market === 'US' || market === 'HK') {
    const codeSym = canonicalSymbolForMarket(market, code)
    if (fromId && canonicalSymbolForMarket(market, fromId.symbol) === codeSym) {
      return normalizeInstrumentRef(fromId)
    }
    return normalizeInstrumentRef({
      market,
      assetClass: 'EQUITY',
      symbol: codeSym,
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
  const isFund = ref.assetClass === 'FUND'
  return {
    code: ref.symbol,
    name: item.nameCn ?? item.code,
    industry: isFund ? 'FUND' : (item.industryName ?? ''),
    market: isFund ? 'PF' : (ref.exchange ?? ref.market),
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
