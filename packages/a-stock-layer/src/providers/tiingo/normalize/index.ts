import type { StockKline, StockListItem, StockRealtime } from '@opptrix/shared'
import {
  normalizeUsSymbol,
  resolveUsQuoteSession,
  usQuoteSessionLabel,
} from '../../../utils/us-market.js'

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export function mapTiingoIex(symbol: string, rows: unknown, nameHint = ''): StockRealtime | null {
  const list = Array.isArray(rows) ? rows : [rows]
  const row = list[0] as Record<string, unknown> | undefined
  if (!row) return null
  const sym = normalizeUsSymbol(String(row.ticker ?? symbol))
  const session = resolveUsQuoteSession()
  const preClose = n(row.prevClose)
  const price = n(row.last) ?? n(row.tngoLast) ?? n(row.mid) ?? preClose
  let changePct: number | null = null
  if (price != null && preClose != null && preClose !== 0) {
    changePct = ((price - preClose) / preClose) * 100
  }
  return {
    code: sym,
    name: nameHint || sym,
    price,
    changePct,
    pe: null,
    pb: null,
    turnoverRate: null,
    open: n(row.open),
    high: n(row.high),
    low: n(row.low),
    preClose,
    volume: n(row.volume),
    amount: null,
    quoteSession: session,
    sessionLabel: usQuoteSessionLabel(session),
    preMarketPrice: null,
    postMarketPrice: null,
  }
}

export function mapTiingoDailyPrices(symbol: string, rows: unknown[]): StockKline[] {
  const sym = normalizeUsSymbol(symbol)
  const out: StockKline[] = []
  for (const item of rows) {
    const r = item as Record<string, unknown>
    const date = String(r.date ?? '').slice(0, 10)
    if (!date) continue
    const close = n(r.adjClose) ?? n(r.close) ?? 0
    const open = n(r.adjOpen) ?? n(r.open) ?? close
    const prevClose = out.length ? out[out.length - 1]!.close : open
    const changePct = prevClose ? ((close - prevClose) / prevClose) * 100 : null
    out.push({
      code: sym,
      date,
      open,
      high: n(r.adjHigh) ?? n(r.high) ?? close,
      low: n(r.adjLow) ?? n(r.low) ?? close,
      close,
      volume: n(r.adjVolume) ?? n(r.volume) ?? 0,
      amount: 0,
      changePct,
      turnoverRate: null,
    })
  }
  return out
}

export function mapTiingoProfile(symbol: string, json: Record<string, unknown>): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null
  const sym = normalizeUsSymbol(String(json.ticker ?? symbol))
  return {
    code: sym,
    name: String(json.name ?? sym),
    industry: String(json.exchangeCode ?? ''),
    sector: '',
    listDate: String(json.startDate ?? '').slice(0, 10) || null,
    description: String(json.description ?? ''),
  }
}

export function mapTiingoSearchResults(rows: unknown[]): StockListItem[] {
  const out: StockListItem[] = []
  for (const item of rows) {
    const r = item as Record<string, unknown>
    const assetType = String(r.assetType ?? '').toLowerCase()
    if (assetType && !assetType.includes('stock') && assetType !== 'etf') continue
    const code = normalizeUsSymbol(String(r.ticker ?? ''))
    if (!code) continue
    out.push({
      code,
      name: String(r.name ?? code),
      market: 'US',
      industry: String(r.exchangeCode ?? ''),
    })
  }
  return out
}
