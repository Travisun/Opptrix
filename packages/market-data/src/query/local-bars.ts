import type { StockKline } from '@inno-a-stock/shared'
import type { MarketDataStore } from '../store.js'
import { normalizeStockCode } from '../utils.js'

export interface LocalQuoteRow {
  code: string
  name: string | null
  trade_date: string | null
  close: number | null
  change_pct: number | null
  pe: number | null
  pb: number | null
  market_cap: number | null
}

/** Latest synced daily quote from local L0 store. */
export function queryLocalLatestQuote(store: MarketDataStore, code: string): LocalQuoteRow | null {
  const normalized = normalizeStockCode(code)
  const row = store.db.prepare(`
    SELECT
      s.code,
      s.name,
      q.trade_date,
      q.close,
      q.change_pct,
      q.pe,
      q.pb,
      q.market_cap
    FROM stocks s
    LEFT JOIN stock_quotes_daily q ON q.code = s.code
      AND q.trade_date = (SELECT MAX(trade_date) FROM stock_quotes_daily)
    WHERE s.code = ?
  `).get(normalized) as LocalQuoteRow | undefined
  return row ?? null
}

/** Daily K-lines from local L0 store (newest-first query, returned ascending). */
export function queryLocalDailyKlines(
  store: MarketDataStore,
  code: string,
  limit = 800,
  before?: string,
): StockKline[] {
  const normalized = normalizeStockCode(code)
  const safeLimit = Math.max(1, Math.min(limit, 800))
  const params: unknown[] = [normalized]
  let beforeClause = ''
  if (before) {
    beforeClause = ' AND trade_date < ?'
    params.push(before.slice(0, 10))
  }
  params.push(safeLimit)
  const rows = store.db.prepare(`
    SELECT trade_date, open, high, low, close, volume, amount, change_pct
    FROM stock_klines_daily
    WHERE code = ?${beforeClause}
    ORDER BY trade_date DESC
    LIMIT ?
  `).all(...params) as {
    trade_date: string
    open: number | null
    high: number | null
    low: number | null
    close: number | null
    volume: number | null
    amount: number | null
    change_pct: number | null
  }[]

  return rows.reverse().map(row => ({
    code: normalized,
    date: row.trade_date,
    open: row.open ?? 0,
    high: row.high ?? 0,
    low: row.low ?? 0,
    close: row.close ?? 0,
    volume: row.volume ?? 0,
    amount: row.amount ?? 0,
    changePct: row.change_pct ?? null,
    turnoverRate: null,
  }))
}
