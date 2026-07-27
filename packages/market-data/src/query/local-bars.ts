import type { StockKline } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { marketReadOne } from './duck-read.js'
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
  const row = marketReadOne<LocalQuoteRow & Record<string, unknown>>(
    store,
    `
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
  `,
    [normalized],
    () => store.db.prepare(`
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
    `).get(normalized) as (LocalQuoteRow & Record<string, unknown>) | undefined,
  )
  return row ?? null
}

/** @deprecated 主库不再提供静态日 K；恒返回空数组。请用在线 queryInstrumentData('kline') */
export function queryLocalDailyKlines(
  _store: MarketDataStore,
  _code: string,
  _limit = 800,
  _before?: string,
): StockKline[] {
  return []
}
