import type { StockKline, StockRealtime } from '@opptrix/shared'
import type { GlobalIndex, IndexKline, StockProfile } from '../../core/schema.js'
import type { YfinanceGlobalIndex } from './symbols.js'

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function pct(v: unknown): number | null {
  const x = n(v)
  if (x == null) return null
  if (Math.abs(x) < 1 && x !== 0) return x * 100
  return x
}

type YahooQuote = {
  symbol?: string
  shortName?: string
  longName?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
  regularMarketOpen?: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
  regularMarketPreviousClose?: number
  regularMarketVolume?: number
}

export function mapQuoteToGlobalIndex(
  target: YfinanceGlobalIndex,
  quote: YahooQuote,
): GlobalIndex {
  return {
    code: target.outCode,
    name: String(quote.shortName ?? quote.longName ?? target.name),
    price: n(quote.regularMarketPrice),
    changePct: pct(quote.regularMarketChangePercent),
    market: target.market,
    timestamp: new Date().toISOString(),
  }
}

export function mapQuoteToIndexRealtime(
  displayCode: string,
  quote: YahooQuote,
): StockRealtime {
  const price = n(quote.regularMarketPrice)
  const preClose = n(quote.regularMarketPreviousClose)
  let changePct = pct(quote.regularMarketChangePercent)
  if (changePct == null && price != null && preClose != null && preClose !== 0) {
    changePct = ((price - preClose) / preClose) * 100
  }
  return {
    code: displayCode,
    name: String(quote.shortName ?? quote.longName ?? displayCode),
    price,
    changePct,
    pe: null,
    pb: null,
    turnoverRate: null,
    open: n(quote.regularMarketOpen),
    high: n(quote.regularMarketDayHigh),
    low: n(quote.regularMarketDayLow),
    preClose,
    volume: n(quote.regularMarketVolume),
    amount: null,
  }
}

type ChartQuote = {
  date: Date
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
}

function formatChartDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function mapChartQuotesToKlines(
  displayCode: string,
  quotes: ChartQuote[],
  count?: number,
): StockKline[] {
  const rows: StockKline[] = []
  for (const q of quotes) {
    const close = n(q.close)
    if (close == null) continue
    const open = n(q.open) ?? close
    const prev = rows.length ? rows[rows.length - 1]!.close : open
    rows.push({
      code: displayCode,
      date: formatChartDate(q.date),
      open,
      high: n(q.high) ?? close,
      low: n(q.low) ?? close,
      close,
      volume: n(q.volume) ?? 0,
      amount: 0,
      changePct: prev ? ((close - prev) / prev) * 100 : null,
      turnoverRate: null,
    })
  }
  const limit = count ?? rows.length
  return rows.slice(-limit)
}

export function mapChartQuotesToIndexKlines(
  displayCode: string,
  quotes: ChartQuote[],
  count?: number,
): IndexKline[] {
  return mapChartQuotesToKlines(displayCode, quotes, count).map(row => ({
    code: row.code,
    date: row.date,
    open: row.open,
    close: row.close,
    high: row.high,
    low: row.low,
    volume: row.volume,
    amount: row.amount,
    changePct: row.changePct,
  }))
}

type QuoteSummaryLike = {
  price?: {
    symbol?: string
    shortName?: string
    longName?: string
    regularMarketPrice?: number
    marketCap?: number
  }
  summaryProfile?: {
    longName?: string
    industry?: string
    sector?: string
    website?: string
    fullTimeEmployees?: number
    city?: string
    state?: string
    country?: string
    longBusinessSummary?: string
  }
  assetProfile?: {
    longName?: string
    industry?: string
    sector?: string
    website?: string
    fullTimeEmployees?: number
    city?: string
    state?: string
    country?: string
    longBusinessSummary?: string
  }
  summaryDetail?: {
    marketCap?: number
  }
}

export function mapQuoteSummaryToProfile(
  displayCode: string,
  summary: QuoteSummaryLike,
): StockProfile {
  const profile = summary.summaryProfile ?? summary.assetProfile
  const price = summary.price
  const name = price?.shortName ?? price?.longName ?? profile?.longName ?? displayCode
  const industry = profile?.industry ?? profile?.sector
  const marketCap = summary.summaryDetail?.marketCap ?? price?.marketCap ?? null
  return {
    code: displayCode,
    name,
    orgName: profile?.longName ?? price?.longName,
    industry: industry ?? undefined,
    industrySecondary: profile?.sector,
    mainBusiness: profile?.longBusinessSummary?.slice(0, 200),
    orgProfile: profile?.longBusinessSummary,
    totalMarketCap: marketCap,
    employees: profile?.fullTimeEmployees ?? null,
    city: profile?.city,
    province: profile?.state,
    website: profile?.website,
  }
}

export function mapSectorQuoteRow(
  board: { code: string; name: string; market: string; tag?: string },
  quote: YahooQuote,
): Record<string, unknown> {
  return {
    code: board.code,
    name: board.name,
    market: board.market,
    sector_tag: board.tag ?? 'sector',
    price: n(quote.regularMarketPrice),
    change_pct: pct(quote.regularMarketChangePercent),
    chart_symbol: board.code,
  }
}
