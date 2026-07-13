import { attachSqlite, detachSqlite, type DuckConnection } from '../kline/duck-connection.js'

export async function attachSqliteReadOnly(conn: DuckConnection, sqlitePath: string): Promise<void> {
  await attachSqlite(conn, sqlitePath, 'md', true)
}

export async function attachSqliteWrite(conn: DuckConnection, sqlitePath: string): Promise<void> {
  await attachSqlite(conn, sqlitePath, 'md', false)
}

/** 统一行情 CTE — quotes + klines 回退 */
export const MARKET_QUOTE_CTES = `
  WITH market_ref AS (
    SELECT COALESCE(
      (SELECT MAX(trade_date) FROM fact_quotes_daily),
      (SELECT MAX(trade_date) FROM cn_daily_bars)
    ) AS trade_date
  ),
  quotes_ref AS (
    SELECT q.code, q.close, q.change_pct, q.pe, q.pb, q.market_cap
    FROM fact_quotes_daily q
    INNER JOIN market_ref mr ON q.trade_date = mr.trade_date
  ),
  klines_ref AS (
    SELECT k.code, k.close, k.change_pct
    FROM cn_daily_bars k
    INNER JOIN market_ref mr ON k.trade_date = mr.trade_date
  ),
  latest_quote AS (
    SELECT q.code, q.close, q.change_pct, q.pe, q.pb, q.market_cap
    FROM fact_quotes_daily q
    INNER JOIN (
      SELECT code, MAX(trade_date) AS trade_date FROM fact_quotes_daily GROUP BY code
    ) l ON q.code = l.code AND q.trade_date = l.trade_date
  ),
  latest_kline AS (
    SELECT k.code, k.close, k.change_pct
    FROM cn_daily_bars k
    INNER JOIN (
      SELECT code, MAX(trade_date) AS trade_date FROM cn_daily_bars GROUP BY code
    ) l ON k.code = l.code AND k.trade_date = l.trade_date
  ),
  quotes AS (
    SELECT * FROM quotes_ref
    UNION ALL
    SELECT q.* FROM latest_quote q WHERE q.code NOT IN (SELECT code FROM quotes_ref)
  ),
  klines AS (
    SELECT k.code, k.close, k.change_pct FROM klines_ref k
    UNION ALL
    SELECT k.code, k.close, k.change_pct FROM latest_kline k
    WHERE k.code NOT IN (SELECT code FROM klines_ref)
      AND k.code NOT IN (SELECT code FROM quotes)
  )
`

export const EFFECTIVE_CHANGE_PCT = 'COALESCE(q.change_pct, k.change_pct)'
export const EFFECTIVE_CLOSE = 'COALESCE(q.close, k.close)'
export const CHANGE_UP = `(${EFFECTIVE_CHANGE_PCT} > 0.0001)`
export const CHANGE_DOWN = `(${EFFECTIVE_CHANGE_PCT} < -0.0001)`

export const LISTABLE_STOCK_WHERE = `
  s.status = 'active'
  AND s.name NOT LIKE '退市%'
  AND TRIM(COALESCE(s.name, '')) != ''
`

export const YI_YUAN = 100_000_000

export function marketBoardSql(markets: string[]): string {
  const parts: string[] = []
  for (const m of markets) {
    if (m === 'SH') parts.push("(s.code LIKE '60%' OR s.code LIKE '68%')")
    else if (m === 'SZ') parts.push("(s.code LIKE '00%' OR s.code LIKE '30%')")
    else if (m === 'BJ') parts.push("(s.code LIKE '43%' OR s.code LIKE '83%' OR s.code LIKE '87%' OR s.code LIKE '92%')")
  }
  return parts.length ? `(${parts.join(' OR ')})` : '1=1'
}
