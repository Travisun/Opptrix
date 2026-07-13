import { duckAll, duckGet, duckRun, type DuckConnection } from '../kline/duck-connection.js'
import { CN_DAILY_TABLE } from './duck-schema.js'
import { attachSqliteWrite } from './duck-query-utils.js'

/** 从 K 线 + 行情 + 财报 SQL 批量计算筛选因子，写回 DuckDB fact_factors 与 SQLite stock_factors */
export async function computeScreenFactors(
  conn: DuckConnection,
  sqlitePath: string,
  tradeDate: string,
  codes?: string[],
): Promise<{ computed: number; written: number }> {
  const codeList = codes?.map(c => `'${String(c).padStart(6, '0')}'`).join(',') ?? ''
  const codeFilter = codeList ? `AND p.code IN (${codeList})` : ''
  const codeFilterDel = codeList ? `AND code IN (${codeList})` : ''

  await duckRun(conn, `
    CREATE OR REPLACE TEMP TABLE _factor_batch AS
    WITH bars AS (
      SELECT code, trade_date, close, volume,
        ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
      FROM ${CN_DAILY_TABLE}
    ),
    pivoted AS (
      SELECT code,
        MAX(CASE WHEN rn = 1 THEN close END) AS c0,
        MAX(CASE WHEN rn = 21 THEN close END) AS c20,
        MAX(CASE WHEN rn = 61 THEN close END) AS c60,
        MAX(CASE WHEN rn = 121 THEN close END) AS c120,
        AVG(CASE WHEN rn BETWEEN 1 AND 5 THEN volume END) AS v5,
        AVG(CASE WHEN rn BETWEEN 6 AND 40 THEN volume END) AS v35
      FROM bars WHERE rn <= 121
      GROUP BY code
    ),
    q AS (
      SELECT code, pe, pb FROM fact_quotes_daily
      WHERE trade_date = (SELECT MAX(trade_date) FROM fact_quotes_daily)
    )
    SELECT
      p.code,
      CASE WHEN q.pe > 0 THEN ROUND(q.pe, 2) END AS pe,
      CASE WHEN q.pb > 0 THEN ROUND(q.pb, 2) END AS pb,
      CASE WHEN f.roe IS NOT NULL THEN ROUND(f.roe, 2) END AS roe,
      CASE WHEN f.gross_margin IS NOT NULL THEN ROUND(f.gross_margin, 2) END AS gross_margin,
      CASE WHEN f.debt_ratio IS NOT NULL THEN ROUND(f.debt_ratio, 2) END AS debt_ratio,
      CASE WHEN f.net_profit_yoy IS NOT NULL THEN ROUND(f.net_profit_yoy, 2) END AS net_profit_yoy,
      CASE WHEN p.c20 > 0 AND p.c0 IS NOT NULL THEN ROUND((p.c0 / p.c20 - 1) * 100, 2) END AS momentum_1m,
      CASE WHEN p.c60 > 0 AND p.c0 IS NOT NULL THEN ROUND((p.c0 / p.c60 - 1) * 100, 2) END AS momentum_3m,
      CASE WHEN p.c120 > 0 AND p.c0 IS NOT NULL THEN ROUND((p.c0 / p.c120 - 1) * 100, 2) END AS momentum_6m,
      CASE WHEN p.v35 > 0 THEN ROUND(p.v5 / p.v35, 2) END AS volume_ratio
    FROM pivoted p
    INNER JOIN dim_cn_stocks s ON s.code = p.code AND s.status = 'active'
    LEFT JOIN q ON q.code = p.code
    LEFT JOIN dim_financials_latest f ON f.code = p.code
    WHERE p.c0 IS NOT NULL ${codeFilter}
  `)

  const countRow = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM _factor_batch')
  const computed = countRow?.c ?? 0
  if (!computed) return { computed: 0, written: 0 }

  const factorNames = [
    'pe', 'pb', 'roe', 'gross_margin', 'debt_ratio', 'net_profit_yoy',
    'momentum_1m', 'momentum_3m', 'momentum_6m', 'volume_ratio',
  ]
  await duckRun(conn, `
    DELETE FROM fact_factors WHERE trade_date = ? ${codeFilterDel}
  `, tradeDate)

  for (const name of factorNames) {
    await duckRun(conn, `
      INSERT INTO fact_factors (trade_date, code, factor_name, factor_value)
      SELECT ?, code, ?, ${name}
      FROM _factor_batch WHERE ${name} IS NOT NULL
    `, tradeDate, name)
  }

  await attachSqliteWrite(conn, sqlitePath)
  await duckRun(conn, `
    DELETE FROM md.stock_factors
    WHERE trade_date = ? ${codeFilterDel}
      AND factor_name IN (${factorNames.map(n => `'${n}'`).join(',')})
  `, tradeDate)
  await duckRun(conn, `
    INSERT INTO md.stock_factors (trade_date, code, factor_name, factor_value)
    SELECT trade_date, code, factor_name, factor_value
    FROM fact_factors
    WHERE trade_date = ?
      AND factor_name IN (${factorNames.map(n => `'${n}'`).join(',')})
      ${codeFilterDel}
  `, tradeDate)
  await duckRun(conn, 'DETACH md')

  const written = (await duckGet<{ c: number }>(conn, `
    SELECT COUNT(*)::INTEGER AS c FROM fact_factors WHERE trade_date = ?
  `, tradeDate))?.c ?? 0

  return { computed, written }
}

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

export async function listComputedFactorCodes(
  conn: DuckConnection,
  tradeDate: string,
): Promise<string[]> {
  const rows = await duckAll<{ code: string }>(conn, `
    SELECT DISTINCT code FROM fact_factors WHERE trade_date = ?
  `, tradeDate)
  return rows.map(r => r.code)
}
