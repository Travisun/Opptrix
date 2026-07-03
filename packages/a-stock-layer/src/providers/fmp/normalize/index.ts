import type { FinancialSummary, StockKline, StockListItem, StockRealtime } from '@opptrix/shared'
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

export function mapFmpQuote(symbol: string, rows: unknown): StockRealtime | null {
  const list = Array.isArray(rows) ? rows : [rows]
  const row = list[0] as Record<string, unknown> | undefined
  if (!row) return null
  const sym = normalizeUsSymbol(String(row.symbol ?? symbol))
  const session = resolveUsQuoteSession()
  const preClose = n(row.previousClose)
  const price = n(row.price) ?? preClose
  let changePct = n(row.changesPercentage)
  if (changePct != null && Math.abs(changePct) < 1 && changePct !== 0) {
    changePct = changePct * 100
  }
  if (changePct == null && price != null && preClose != null && preClose !== 0) {
    changePct = ((price - preClose) / preClose) * 100
  }
  return {
    code: sym,
    name: String(row.name ?? sym),
    price,
    changePct,
    pe: n(row.pe),
    pb: null,
    turnoverRate: null,
    open: n(row.open),
    high: n(row.dayHigh),
    low: n(row.dayLow),
    preClose,
    volume: n(row.volume),
    amount: null,
    quoteSession: session,
    sessionLabel: usQuoteSessionLabel(session),
    preMarketPrice: null,
    postMarketPrice: null,
  }
}

export function mapFmpHistorical(symbol: string, json: Record<string, unknown>): StockKline[] {
  const sym = normalizeUsSymbol(symbol)
  const historical = (json.historical ?? json) as unknown[]
  const rows = Array.isArray(historical) ? historical : []
  const out: StockKline[] = []
  const sorted = [...rows].reverse()
  for (const item of sorted) {
    const r = item as Record<string, unknown>
    const date = String(r.date ?? '').slice(0, 10)
    if (!date) continue
    const close = n(r.adjClose) ?? n(r.close) ?? 0
    const open = n(r.open) ?? close
    const prevClose = out.length ? out[out.length - 1]!.close : open
    const changePct = prevClose ? ((close - prevClose) / prevClose) * 100 : null
    out.push({
      code: sym,
      date,
      open,
      high: n(r.high) ?? close,
      low: n(r.low) ?? close,
      close,
      volume: n(r.volume) ?? 0,
      amount: 0,
      changePct,
      turnoverRate: null,
    })
  }
  return out
}

export function mapFmpProfile(symbol: string, rows: unknown): Record<string, unknown> | null {
  const list = Array.isArray(rows) ? rows : [rows]
  const r = list[0] as Record<string, unknown> | undefined
  if (!r) return null
  const sym = normalizeUsSymbol(String(r.symbol ?? symbol))
  return {
    code: sym,
    name: String(r.companyName ?? r.name ?? sym),
    industry: String(r.industry ?? ''),
    sector: String(r.sector ?? ''),
    listDate: String(r.ipoDate ?? '').slice(0, 10) || null,
    description: String(r.description ?? ''),
  }
}

export function mapFmpSearchResults(rows: unknown[]): StockListItem[] {
  const out: StockListItem[] = []
  for (const item of rows) {
    const r = item as Record<string, unknown>
    const code = normalizeUsSymbol(String(r.symbol ?? ''))
    if (!code) continue
    out.push({
      code,
      name: String(r.name ?? code),
      market: 'US',
      industry: String(r.exchangeShortName ?? r.exchange ?? ''),
    })
  }
  return out
}

export function mapFmpFinancials(
  symbol: string,
  rows: unknown[],
  reportType: 'annual' | 'quarter',
): FinancialSummary[] {
  const sym = normalizeUsSymbol(symbol)
  const out: FinancialSummary[] = []
  for (const item of rows) {
    const r = item as Record<string, unknown>
    const date = String(r.date ?? r.fillingDate ?? '').slice(0, 10)
    if (!date) continue
    out.push({
      code: sym,
      reportDate: date,
      reportType: reportType === 'quarter' ? 'quarter' : 'annual',
      revenue: n(r.revenue),
      revenueYoy: null,
      netProfit: n(r.netIncome),
      netProfitYoy: null,
      eps: n(r.eps),
      roe: n(r.returnOnEquity) != null ? n(r.returnOnEquity)! * 100 : null,
      grossMargin: n(r.grossProfitRatio) != null ? n(r.grossProfitRatio)! * 100 : null,
      netMargin: n(r.netIncomeRatio) != null ? n(r.netIncomeRatio)! * 100 : null,
      debtRatio: null,
      operatingCashFlow: null,
    })
  }
  return out
}
