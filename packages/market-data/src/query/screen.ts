import type Database from 'better-sqlite3'
import type { MarketDataStore } from '../store.js'
import { todayTradeDate } from '../utils.js'

export interface ScreenCondition {
  factor: string
  op: '>' | '<' | '>=' | '<=' | '='
  value: number
}

export interface LocalScreenItem {
  code: string
  name: string
  total_score: number | null
  industry: string | null
  pe: number | null
  pb: number | null
  key_factors: Record<string, number | null>
}

export function latestFactorDate(db: Database.Database): string | null {
  const row = db.prepare('SELECT MAX(trade_date) AS d FROM stock_factors').get() as { d: string | null }
  return row.d
}

export function localScreen(
  store: MarketDataStore,
  conditions: ScreenCondition[],
  tradeDate?: string,
  topN = 20,
  excludeSt = true,
): { trade_date: string; passed: number; items: LocalScreenItem[] } {
  const db = store.db
  const date = tradeDate ?? latestFactorDate(db) ?? todayTradeDate()

  if (!conditions.length) {
    return { trade_date: date, passed: 0, items: [] }
  }

  const wheres = ["s.status = 'active'"]
  if (excludeSt) wheres.push('s.is_st = 0')

  const joinParams: unknown[] = []
  let joinSql = ''
  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i]
    const alias = `f${i}`
    joinSql += `
      INNER JOIN stock_factors ${alias}
        ON ${alias}.code = s.code
        AND ${alias}.trade_date = ?
        AND ${alias}.factor_name = ?
        AND ${alias}.factor_value ${c.op} ?
    `
    joinParams.push(date, c.factor, c.value)
  }

  const countRow = db.prepare(`
    SELECT COUNT(DISTINCT s.code) AS c
    FROM stocks s
    ${joinSql}
    WHERE ${wheres.join(' AND ')}
  `).get(...joinParams) as { c: number }

  const rows = db.prepare(`
    SELECT DISTINCT
      s.code,
      s.name,
      s.industry,
      sc.total_score,
      q.pe,
      q.pb
    FROM stocks s
    ${joinSql}
    LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
    LEFT JOIN stock_quotes_daily q ON q.code = s.code AND q.trade_date = ?
    WHERE ${wheres.join(' AND ')}
    ORDER BY sc.total_score DESC
    LIMIT ?
  `).all(...joinParams, date, date, topN) as {
    code: string
    name: string
    industry: string | null
    total_score: number | null
    pe: number | null
    pb: number | null
  }[]

  const factorStmt = db.prepare(
    'SELECT factor_value FROM stock_factors WHERE trade_date = ? AND code = ? AND factor_name = ?',
  )

  const items: LocalScreenItem[] = rows.map(row => {
    const key_factors: Record<string, number | null> = {}
    for (const c of conditions) {
      const f = factorStmt.get(date, row.code, c.factor) as { factor_value: number | null } | undefined
      key_factors[c.factor] = f?.factor_value ?? null
    }
    return {
      code: row.code,
      name: row.name,
      total_score: row.total_score,
      industry: row.industry,
      pe: row.pe,
      pb: row.pb,
      key_factors,
    }
  })

  return { trade_date: date, passed: countRow?.c ?? items.length, items }
}

export function queryIndustryStats(store: MarketDataStore, tradeDate?: string) {
  const date = tradeDate ?? latestFactorDate(store.db) ?? todayTradeDate()
  return store.db.prepare(`
    SELECT industry, stock_count, avg_score, avg_pe, avg_pb
    FROM industry_stats
    WHERE trade_date = ?
    ORDER BY stock_count DESC
  `).all(date)
}

export function queryRadarBatch(store: MarketDataStore, codes: string[], tradeDate?: string) {
  const date = tradeDate ?? latestFactorDate(store.db) ?? todayTradeDate()
  if (!codes.length) return []
  const placeholders = codes.map(() => '?').join(',')
  return store.db.prepare(`
    SELECT
      s.code,
      s.name,
      s.industry,
      sc.total_score,
      sc.scorecard,
      q.pe,
      q.pb,
      f_pe.factor_value AS pe_percentile,
      f_pb.factor_value AS pb_percentile
    FROM stocks s
    LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
    LEFT JOIN stock_quotes_daily q ON q.code = s.code AND q.trade_date = ?
    LEFT JOIN stock_factors f_pe ON f_pe.code = s.code AND f_pe.trade_date = ? AND f_pe.factor_name = 'pe_percentile'
    LEFT JOIN stock_factors f_pb ON f_pb.code = s.code AND f_pb.trade_date = ? AND f_pb.factor_name = 'pb_percentile'
    WHERE s.code IN (${placeholders})
  `).all(date, date, date, date, ...codes)
}

export function queryStockSnapshot(store: MarketDataStore, code: string) {
  return store.db.prepare('SELECT * FROM v_stock_latest WHERE code = ?').get(code)
}

export interface DiscoverCandidateRow {
  code: string
  name: string
  industry: string | null
  total_score: number | null
  pe: number | null
  pb: number | null
  factors: Record<string, number | null>
}

/** Compact rows for agent discover mining — only requested factor columns. */
export function queryDiscoverCandidates(
  store: MarketDataStore,
  codes: string[],
  factorNames: readonly string[],
  tradeDate?: string,
): DiscoverCandidateRow[] {
  if (!codes.length) return []
  const date = tradeDate ?? latestFactorDate(store.db) ?? todayTradeDate()
  const placeholders = codes.map(() => '?').join(',')
  const baseRows = store.db.prepare(`
    SELECT
      s.code,
      s.name,
      s.industry,
      sc.total_score,
      q.pe,
      q.pb
    FROM stocks s
    LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
    LEFT JOIN stock_quotes_daily q ON q.code = s.code AND q.trade_date = ?
    WHERE s.code IN (${placeholders})
  `).all(date, date, ...codes) as {
    code: string
    name: string
    industry: string | null
    total_score: number | null
    pe: number | null
    pb: number | null
  }[]

  const factorStmt = store.db.prepare(
    'SELECT factor_value FROM stock_factors WHERE trade_date = ? AND code = ? AND factor_name = ?',
  )

  return baseRows.map(row => {
    const factors: Record<string, number | null> = {}
    for (const f of factorNames) {
      const r = factorStmt.get(date, row.code, f) as { factor_value: number | null } | undefined
      factors[f] = r?.factor_value ?? null
    }
    return {
      code: row.code,
      name: row.name,
      industry: row.industry,
      total_score: row.total_score,
      pe: row.pe,
      pb: row.pb,
      factors,
    }
  })
}
