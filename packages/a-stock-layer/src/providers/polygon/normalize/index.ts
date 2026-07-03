import type { StockKline, StockListItem, StockRealtime, FinancialSummary } from '@opptrix/shared'
import {
  resolveUsQuoteSession,
  usQuoteSessionLabel,
  type UsQuoteSession,
  usDateFromMs,
  normalizeUsSymbol,
} from '../../../utils/us-market.js'

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export function mapPolygonSnapshot(symbol: string, json: Record<string, unknown>): StockRealtime | null {
  const ticker = json.ticker as Record<string, unknown> | undefined
  if (!ticker) return null
  const sym = normalizeUsSymbol(String(ticker.ticker ?? symbol))
  const day = ticker.day as Record<string, unknown> | undefined
  const prev = ticker.prevDay as Record<string, unknown> | undefined
  const lastQuote = ticker.lastQuote as Record<string, unknown> | undefined
  const lastTrade = ticker.lastTrade as Record<string, unknown> | undefined
  const preMarket = ticker.preMarket as Record<string, unknown> | undefined
  const afterHours = (ticker.afterHours ?? ticker.aftermarket) as Record<string, unknown> | undefined

  const preMarketPrice = n(preMarket?.c) ?? n(preMarket?.close)
  const postMarketPrice = n(afterHours?.c) ?? n(afterHours?.close)
  const regularPrice = n(day?.c) ?? n(lastQuote?.p) ?? n(lastTrade?.p)

  let session: UsQuoteSession = resolveUsQuoteSession()
  const preClose = n(prev?.c) ?? n(day?.o)
  let price = regularPrice
  if (session === 'pre' && preMarketPrice != null) price = preMarketPrice
  else if (session === 'post' && postMarketPrice != null) price = postMarketPrice
  else if (price == null && preMarketPrice != null && session === 'pre') price = preMarketPrice
  else if (price == null && postMarketPrice != null && session === 'post') price = postMarketPrice

  if (session === 'closed' && preMarketPrice != null && regularPrice == null) {
    session = 'pre'
    price = preMarketPrice
  }

  let changePct = n(ticker.todaysChangePerc)
  if (changePct == null && price != null && preClose != null && preClose !== 0) {
    changePct = ((price - preClose) / preClose) * 100
  }
  return {
    code: sym,
    name: sym,
    price,
    changePct,
    pe: null,
    pb: null,
    turnoverRate: null,
    open: n(day?.o),
    high: n(day?.h),
    low: n(day?.l),
    preClose,
    volume: n(day?.v),
    amount: n(day?.vw) != null && n(day?.v) != null ? (n(day!.vw)! * n(day!.v)!) : null,
    quoteSession: session,
    sessionLabel: usQuoteSessionLabel(session),
    preMarketPrice,
    postMarketPrice,
  }
}

export function mapPolygonAggregates(symbol: string, rows: unknown[]): StockKline[] {
  const sym = normalizeUsSymbol(symbol)
  const out: StockKline[] = []
  for (const row of rows) {
    const r = row as Record<string, unknown>
    const ms = n(r.t)
    if (ms == null) continue
    const close = n(r.c) ?? 0
    const open = n(r.o) ?? close
    const prevClose = out.length ? out[out.length - 1]!.close : open
    const changePct = prevClose ? ((close - prevClose) / prevClose) * 100 : null
    out.push({
      code: sym,
      date: usDateFromMs(ms),
      open,
      high: n(r.h) ?? close,
      low: n(r.l) ?? close,
      close,
      volume: n(r.v) ?? 0,
      amount: n(r.vw) != null && n(r.v) != null ? n(r.vw)! * n(r.v)! : 0,
      changePct,
      turnoverRate: null,
    })
  }
  return out
}

export function mapPolygonProfile(symbol: string, json: Record<string, unknown>): Record<string, unknown> | null {
  const r = (json.results ?? json) as Record<string, unknown>
  if (!r || typeof r !== 'object') return null
  const sym = normalizeUsSymbol(String(r.ticker ?? symbol))
  return {
    code: sym,
    name: String(r.name ?? sym),
    market: 'US',
    exchange: String(r.primary_exchange ?? r.exchange ?? ''),
    currency: String(r.currency_name ?? 'USD'),
    listDate: String(r.list_date ?? '').slice(0, 10),
    sector: String(r.sic_description ?? r.sector ?? ''),
    industry: String(r.industry ?? ''),
    marketCap: n(r.market_cap),
    description: String(r.description ?? ''),
    homepage: String(r.homepage_url ?? ''),
    locale: String(r.locale ?? 'us'),
  }
}

export function mapPolygonTickerList(rows: unknown[]): StockListItem[] {
  const out: StockListItem[] = []
  for (const row of rows) {
    const r = row as Record<string, unknown>
    const sym = normalizeUsSymbol(String(r.ticker ?? ''))
    if (!sym) continue
    out.push({
      code: sym,
      name: String(r.name ?? sym),
      market: 'US',
      industry: String(r.sic_description ?? r.industry ?? ''),
    })
  }
  return out
}

function finVal(node: unknown): number | null {
  if (node == null || typeof node !== 'object') return null
  const v = (node as Record<string, unknown>).value
  return n(v)
}

export function mapPolygonFinancials(
  symbol: string,
  rows: unknown[],
  reportType = 'annual',
): FinancialSummary[] {
  const sym = normalizeUsSymbol(symbol)
  const out: FinancialSummary[] = []
  for (const row of rows) {
    const r = row as Record<string, unknown>
    const fin = r.financials as Record<string, unknown> | undefined
    if (!fin) continue
    const inc = fin.income_statement as Record<string, unknown> | undefined
    const bal = fin.balance_sheet as Record<string, unknown> | undefined
    const cf = fin.cash_flow_statement as Record<string, unknown> | undefined
    const endDate = String(r.end_date ?? r.filing_date ?? '').slice(0, 10)
    if (!endDate) continue
    const revenue = finVal(inc?.revenues ?? inc?.total_revenue ?? inc?.revenue)
    const netProfit = finVal(inc?.net_income_loss ?? inc?.net_income)
    const grossProfit = finVal(inc?.gross_profit)
    const totalAssets = finVal(bal?.assets ?? bal?.total_assets)
    const totalLiabilities = finVal(bal?.liabilities ?? bal?.total_liabilities)
    const equity = finVal(bal?.equity ?? bal?.stockholders_equity)
    let grossMargin: number | null = null
    if (grossProfit != null && revenue != null && revenue !== 0) {
      grossMargin = (grossProfit / revenue) * 100
    }
    let netMargin: number | null = null
    if (netProfit != null && revenue != null && revenue !== 0) {
      netMargin = (netProfit / revenue) * 100
    }
    let roe: number | null = null
    if (netProfit != null && equity != null && equity !== 0) {
      roe = (netProfit / equity) * 100
    }
    let debtRatio: number | null = null
    if (totalLiabilities != null && totalAssets != null && totalAssets !== 0) {
      debtRatio = (totalLiabilities / totalAssets) * 100
    }
    out.push({
      code: sym,
      reportDate: endDate,
      reportType: String(r.fiscal_period ?? reportType).toLowerCase().includes('q') ? 'quarter' : reportType,
      revenue,
      revenueYoy: null,
      netProfit,
      netProfitYoy: null,
      eps: finVal(inc?.basic_earnings_per_share ?? inc?.diluted_earnings_per_share),
      roe,
      grossMargin,
      netMargin,
      debtRatio,
      operatingCashFlow: finVal(cf?.net_cash_flow_from_operating_activities),
      totalAssets,
      totalLiabilities,
    })
  }
  return out
}
