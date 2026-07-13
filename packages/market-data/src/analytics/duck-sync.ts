import type { DuckConnection } from '../kline/duck-connection.js'
import { duckGet, duckRun } from '../kline/duck-connection.js'
import { ANALYTICS_INIT_SQL } from './duck-schema.js'

export type AnalyticsSyncScope = 'dims' | 'quotes' | 'factors' | 'scores' | 'financials' | 'all'

export async function ensureAnalyticsSchema(conn: DuckConnection): Promise<void> {
  await duckRun(conn, ANALYTICS_INIT_SQL)
}

async function attachSqlite(conn: DuckConnection, sqlitePath: string, readOnly = false): Promise<void> {
  await duckRun(conn, `INSTALL sqlite; LOAD sqlite;`)
  await duckRun(conn, `ATTACH ? AS md (TYPE SQLITE${readOnly ? ', READ_ONLY true' : ''})`, sqlitePath)
}

export async function syncDims(conn: DuckConnection, sqlitePath: string): Promise<number> {
  await attachSqlite(conn, sqlitePath, true)
  await duckRun(conn, 'DELETE FROM dim_cn_stocks')
  await duckRun(conn, `
    INSERT INTO dim_cn_stocks
    SELECT code, name, market, industry, industry_csrc, listing_date,
           CAST(is_st AS BOOLEAN), status, updated_at
    FROM md.stocks
  `)
  await duckRun(conn, 'DELETE FROM dim_instruments')
  await duckRun(conn, `
    INSERT INTO dim_instruments
    SELECT market, COALESCE(exchange, ''), code, asset_class, name, instrument_ns,
           list_date, status, updated_at
    FROM md.instruments
  `)
  await duckRun(conn, 'DELETE FROM dim_taxonomy')
  await duckRun(conn, `
    INSERT INTO dim_taxonomy
    SELECT id, market, kind, code, name, parent_code, level, stock_count, synced_at
    FROM md.taxonomy_nodes
  `)
  await duckRun(conn, 'DELETE FROM bridge_instrument_taxonomy')
  await duckRun(conn, `
    INSERT INTO bridge_instrument_taxonomy
    SELECT it.market, it.code, it.taxonomy_id, tn.kind, tn.name, it.synced_at
    FROM md.instrument_taxonomy it
    INNER JOIN md.taxonomy_nodes tn ON tn.id = it.taxonomy_id
  `)
  const row = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM dim_cn_stocks')
  await duckRun(conn, 'DETACH md')
  return row?.c ?? 0
}

export async function syncQuotes(conn: DuckConnection, sqlitePath: string): Promise<number> {
  await attachSqlite(conn, sqlitePath, true)
  await duckRun(conn, 'DELETE FROM fact_quotes_daily')
  await duckRun(conn, `
    INSERT INTO fact_quotes_daily
    SELECT trade_date, code, close, change_pct, pe, pb, market_cap, synced_at
    FROM md.stock_quotes_daily
  `)
  const row = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM fact_quotes_daily')
  await duckRun(conn, 'DETACH md')
  return row?.c ?? 0
}

export async function syncFactors(conn: DuckConnection, sqlitePath: string): Promise<number> {
  await attachSqlite(conn, sqlitePath, true)
  await duckRun(conn, 'DELETE FROM fact_factors')
  await duckRun(conn, `
    INSERT INTO fact_factors
    SELECT trade_date, code, factor_name, factor_value
    FROM md.stock_factors
  `)
  const row = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM fact_factors')
  await duckRun(conn, 'DETACH md')
  return row?.c ?? 0
}

export async function syncScores(conn: DuckConnection, sqlitePath: string): Promise<number> {
  await attachSqlite(conn, sqlitePath, true)
  await duckRun(conn, 'DELETE FROM fact_scores')
  await duckRun(conn, `
    INSERT INTO fact_scores
    SELECT trade_date, code, scorecard, total_score
    FROM md.stock_scores
  `)
  const row = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM fact_scores')
  await duckRun(conn, 'DETACH md')
  return row?.c ?? 0
}

export async function syncFinancials(conn: DuckConnection, sqlitePath: string): Promise<number> {
  await attachSqlite(conn, sqlitePath, true)
  await duckRun(conn, 'DELETE FROM dim_financials_latest')
  await duckRun(conn, `
    INSERT INTO dim_financials_latest
    SELECT code, report_date, roe, gross_margin, debt_ratio, net_profit_yoy, net_profit, synced_at
    FROM (
      SELECT code, report_date, roe, gross_margin, debt_ratio, net_profit_yoy, net_profit, synced_at,
        ROW_NUMBER() OVER (PARTITION BY code ORDER BY report_date DESC) AS rn
      FROM md.stock_financials
      WHERE report_type IS NULL OR report_type = 'annual'
    ) t WHERE rn = 1
  `)
  const row = await duckGet<{ c: number }>(conn, 'SELECT COUNT(*)::INTEGER AS c FROM dim_financials_latest')
  await duckRun(conn, 'DETACH md')
  return row?.c ?? 0
}

export async function syncAnalytics(
  conn: DuckConnection,
  sqlitePath: string,
  scope: AnalyticsSyncScope,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const run = async (key: AnalyticsSyncScope, fn: () => Promise<number>) => {
    if (scope === 'all' || scope === key) out[key] = await fn()
  }
  await run('dims', () => syncDims(conn, sqlitePath))
  await run('quotes', () => syncQuotes(conn, sqlitePath))
  await run('factors', () => syncFactors(conn, sqlitePath))
  await run('scores', () => syncScores(conn, sqlitePath))
  await run('financials', () => syncFinancials(conn, sqlitePath))
  return out
}
