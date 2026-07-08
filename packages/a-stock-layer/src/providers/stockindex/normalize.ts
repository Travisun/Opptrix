import type { AssetClass, InstrumentRef, Market, StockListItem } from '@opptrix/shared'
import { isCnEtfCode } from '../../core/instrument.js'
import { normalizeRegionalSymbol } from '../../utils/regional-symbol.js'
import { normalizeUsSymbol } from '../../utils/us-market.js'
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
    const sym = code.replace(/\D/g, '').slice(-6).padStart(6, '0')
    const exchange = item.exchange?.toUpperCase()
      ?? cnExchangeFromInstrumentId(item.instrumentId)
    const assetClass: AssetClass = item.assetType === 'etf' || isCnEtfCode(sym)
      ? 'ETF'
      : 'EQUITY'
    return {
      market: 'CN',
      assetClass,
      symbol: sym,
      exchange: exchange as InstrumentRef['exchange'],
    }
  }

  if (market === 'US') {
    return {
      market: 'US',
      assetClass: 'EQUITY',
      symbol: normalizeUsSymbol(code),
      exchange: item.exchange ?? undefined,
    }
  }

  if (market === 'HK') {
    return {
      market: 'HK',
      assetClass: 'EQUITY',
      symbol: normalizeRegionalSymbol('HK', code),
      exchange: item.exchange ?? 'HK',
    }
  }

  return null
}

export function refLabelFromInstrument(ref: InstrumentRef): string {
  if (ref.market === 'CN') return ref.symbol
  if (ref.market === 'CRYPTO' && ref.quote) return `CRYPTO:${ref.symbol}/${ref.quote}`
  return `${ref.market}:${ref.symbol}`
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
