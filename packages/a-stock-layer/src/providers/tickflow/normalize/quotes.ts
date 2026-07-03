import type { StockRealtime } from '@opptrix/shared'
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

export function mapTickflowQuote(quote: Record<string, unknown>): StockRealtime | null {
  const symbol = String(quote.symbol ?? '')
  if (!symbol) return null

  const { code } = parseTickflowSymbol(symbol)
  const ext = quoteExt(quote)
  const price = num(quote.last_price)
  const preClose = num(quote.prev_close)
  let changePct = pctFromDecimal(ext.change_pct)
  if (changePct == null && price != null && preClose != null && preClose !== 0) {
    changePct = ((price - preClose) / preClose) * 100
  }

  const session = mapSession(quote.session)
  const name = String(ext.name ?? code)

  return {
    code,
    name,
    price,
    changePct,
    pe: null,
    pb: null,
    turnoverRate: pctFromDecimal(ext.turnover_rate),
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
  }
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
