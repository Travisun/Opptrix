import type { StockRealtime } from '@opptrix/shared'
import { usQuoteSessionLabel, type UsQuoteSession } from '../../../utils/us-market.js'
import { parseTickflowSymbol } from '../api/symbols.js'

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** TickFlow decimal ratio (0.01 → 1%) → Opptrix percent */
function pctFromDecimal(v: unknown): number | null {
  const n = num(v)
  if (n == null) return null
  return n * 100
}

function strField(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s || null
}

function quoteExt(quote: Record<string, unknown>): Record<string, unknown> {
  const ext = quote.ext
  if (!ext || typeof ext !== 'object') return {}
  return ext as Record<string, unknown>
}

function mapSession(session: unknown): StockRealtime['quoteSession'] | undefined {
  switch (String(session ?? '')) {
    case 'pre_market': return 'pre'
    case 'regular': return 'regular'
    case 'after_hours': return 'post'
    case 'closed':
    case 'halted':
    case 'lunch_break':
      return 'closed'
    default:
      return undefined
  }
}

function sessionLabelForMarket(
  market: string,
  session: StockRealtime['quoteSession'] | undefined,
): string | undefined {
  if (!session) return undefined
  if (market === 'US') return usQuoteSessionLabel(session as UsQuoteSession)
  return undefined
}

export function mapTickflowQuote(quote: Record<string, unknown>): StockRealtime | null {
  const symbol = String(quote.symbol ?? '')
  if (!symbol) return null

  const { code, market } = parseTickflowSymbol(symbol)
  const ext = quoteExt(quote)
  const price = num(quote.last_price)
  const preClose = num(quote.prev_close)
  let changePct = pctFromDecimal(ext.change_pct)
  if (changePct == null && price != null && preClose != null && preClose !== 0) {
    changePct = ((price - preClose) / preClose) * 100
  }

  const session = mapSession(quote.session)
  const name = String(ext.name ?? quote.name ?? code)

  return {
    code,
    name,
    price,
    changePct,
    pe: num(ext.pe ?? ext.pe_ttm ?? ext.pe_ratio),
    pb: num(ext.pb ?? ext.pb_ratio),
    turnoverRate: pctFromDecimal(ext.turnover_rate),
    marketCap: num(ext.market_cap ?? ext.market_capitalization ?? ext.total_market_cap),
    circulatingMarketCap: num(ext.float_market_cap ?? ext.circulating_market_cap),
    open: num(quote.open),
    high: num(quote.high),
    low: num(quote.low),
    preClose,
    volume: num(quote.volume),
    amount: num(quote.amount),
    change: num(ext.change_amount),
    amplitude: pctFromDecimal(ext.amplitude),
    timestamp: quote.timestamp != null ? String(quote.timestamp) : undefined,
    quoteSession: session,
    sessionLabel: sessionLabelForMarket(market, session),
    preMarketPrice: num(ext.pre_market_price ?? ext.premarket_price),
    postMarketPrice: num(ext.post_market_price ?? ext.after_hours_price),
    week52High: num(ext.week52_high ?? ext.week_52_high ?? ext['52w_high'] ?? ext.high_52w),
    week52Low: num(ext.week52_low ?? ext.week_52_low ?? ext['52w_low'] ?? ext.low_52w),
    currency: strField(ext.currency) ?? (market === 'US' ? 'USD' : market === 'HK' ? 'HKD' : null),
  } as StockRealtime
}

export function mapTickflowQuotes(rows: unknown): StockRealtime[] {
  const list = Array.isArray(rows)
    ? rows
    : rows && typeof rows === 'object'
      ? Object.values(rows as Record<string, unknown>)
      : []
  const out: StockRealtime[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const mapped = mapTickflowQuote(row as Record<string, unknown>)
    if (mapped) out.push(mapped)
  }
  return out
}
