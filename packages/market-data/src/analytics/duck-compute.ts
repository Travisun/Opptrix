import { duckAll, duckGet, duckRun, type DuckConnection } from '../kline/duck-connection.js'
import { CN_DAILY_TABLE } from './duck-schema.js'

/** 从日 K 批量计算筛选因子，写回 DuckDB stock_factors + stock_scores */
export async function computeScreenFactors(
  conn: DuckConnection,
  _sqlitePath: string,
  tradeDate: string,
  codes?: string[],
): Promise<{ computed: number; written: number }> {
  const codeList = codes?.map(c => `'${String(c).padStart(6, '0')}'`).join(',') ?? ''
  const codeFilter = codeList ? `AND p.code IN (${codeList})` : ''
  const codeFilterDel = codeList ? `AND code IN (${codeList})` : ''

  await duckRun(conn, `
    CREATE OR REPLACE TEMP TABLE _factor_batch AS
    WITH bars AS (
      SELECT code, trade_date, close, high, volume,
        ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
      FROM ${CN_DAILY_TABLE}
    ),
    rets AS (
      SELECT b1.code,
        (b1.close / b2.close - 1) * 100 AS ret
      FROM bars b1
      INNER JOIN bars b2 ON b1.code = b2.code AND b1.rn + 1 = b2.rn
      WHERE b1.rn <= 20 AND b1.close > 0 AND b2.close > 0
    ),
    vol AS (
      SELECT code, ROUND(STDDEV_SAMP(ret), 2) AS volatility_20d
      FROM rets
      GROUP BY code
    ),
    pivoted AS (
      SELECT code,
        MAX(CASE WHEN rn = 1 THEN close END) AS c0,
        MAX(CASE WHEN rn = 21 THEN close END) AS c20,
        MAX(CASE WHEN rn = 61 THEN close END) AS c60,
        MAX(CASE WHEN rn = 121 THEN close END) AS c120,
        MAX(CASE WHEN rn <= 60 THEN high END) AS hi60,
        AVG(CASE WHEN rn BETWEEN 1 AND 5 THEN volume END) AS v5,
        AVG(CASE WHEN rn BETWEEN 6 AND 40 THEN volume END) AS v35
      FROM bars WHERE rn <= 121
      GROUP BY code
    )
    SELECT
      p.code,
      CASE WHEN p.c20 > 0 AND p.c0 IS NOT NULL THEN ROUND((p.c0 / p.c20 - 1) * 100, 2) END AS momentum_1m,
      CASE WHEN p.c60 > 0 AND p.c0 IS NOT NULL THEN ROUND((p.c0 / p.c60 - 1) * 100, 2) END AS momentum_3m,
      CASE WHEN p.c120 > 0 AND p.c0 IS NOT NULL THEN ROUND((p.c0 / p.c120 - 1) * 100, 2) END AS momentum_6m,
      CASE WHEN p.v35 > 0 THEN ROUND(p.v5 / p.v35, 2) END AS volume_ratio,
      v.volatility_20d,
      CASE WHEN p.hi60 > 0 AND p.c0 IS NOT NULL THEN ROUND((p.c0 / p.hi60 - 1) * 100, 2) END AS drawdown_60d
    FROM pivoted p
    INNER JOIN dim_cn_stocks s ON s.code = p.code AND s.status = 'active'
    LEFT JOIN vol v ON v.code = p.code
    WHERE p.c0 IS NOT NULL ${codeFilter}
  `)

  const countRow = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM _factor_batch')
  const computed = countRow?.c ?? 0
  if (!computed) return { computed: 0, written: 0 }

  const factorNames = [
    'momentum_1m', 'momentum_3m', 'momentum_6m',
    'volume_ratio', 'volatility_20d', 'drawdown_60d',
  ]
  await duckRun(conn, `
    DELETE FROM stock_factors WHERE trade_date = ? ${codeFilterDel}
  `, tradeDate)

  const syncedAt = new Date().toISOString()
  for (const name of factorNames) {
    await duckRun(conn, `
      INSERT INTO stock_factors (trade_date, code, factor_name, factor_value, synced_at)
      SELECT ?, code, ?, ${name}, ?
      FROM _factor_batch WHERE ${name} IS NOT NULL
    `, tradeDate, name, syncedAt)
  }

  await duckRun(conn, `
    DELETE FROM stock_scores
    WHERE trade_date = ? AND scorecard = '综合评估' ${codeFilterDel}
  `, tradeDate)
  await duckRun(conn, `
    INSERT INTO stock_scores (trade_date, code, scorecard, total_score, synced_at)
    SELECT
      ?,
      code,
      '综合评估',
      ROUND(LEAST(100, GREATEST(0,
        50
        + LEAST(20, GREATEST(-15, COALESCE(momentum_3m, 0) * 0.6))
        + LEAST(10, GREATEST(-5, (COALESCE(volume_ratio, 1) - 1) * 8))
        + LEAST(10, GREATEST(-10, COALESCE(drawdown_60d, 0) * 0.3))
      )), 1),
      ?
    FROM _factor_batch
    WHERE momentum_3m IS NOT NULL OR volume_ratio IS NOT NULL OR drawdown_60d IS NOT NULL
  `, tradeDate, syncedAt)

  const written = (await duckGet<{ c: number }>(conn, `
    SELECT COUNT(*)::INTEGER AS c FROM stock_factors WHERE trade_date = ?
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
