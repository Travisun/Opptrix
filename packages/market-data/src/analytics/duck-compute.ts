import { duckGet, type DuckConnection } from '../kline/duck-connection.js'
import { CN_DAILY_TABLE } from './duck-schema.js'

export async function hasAnalyticsDims(conn: DuckConnection): Promise<boolean> {
  const row = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM dim_cn_stocks')
  return (row?.c ?? 0) > 0
}

export async function analyticsStats(conn: DuckConnection): Promise<{
  stocks: number
  instruments: number
  taxonomy: number
  quotes: number
  factors: number
  klines: number
}> {
  const row = await duckGet<Record<string, number>>(conn, `
    SELECT
      (SELECT COUNT(*)::INTEGER FROM dim_cn_stocks) AS stocks,
      (SELECT COUNT(*)::INTEGER FROM dim_instruments) AS instruments,
      (SELECT COUNT(*)::INTEGER FROM dim_taxonomy) AS taxonomy,
      (SELECT COUNT(*)::INTEGER FROM fact_quotes_daily) AS quotes,
      (SELECT COUNT(*)::INTEGER FROM fact_factors) AS factors,
      (SELECT COUNT(*)::INTEGER FROM ${CN_DAILY_TABLE}) AS klines
  `)
  return {
    stocks: row?.stocks ?? 0,
    instruments: row?.instruments ?? 0,
    taxonomy: row?.taxonomy ?? 0,
    quotes: row?.quotes ?? 0,
    factors: row?.factors ?? 0,
    klines: row?.klines ?? 0,
  }
}
