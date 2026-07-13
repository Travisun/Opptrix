import { duckAll, duckGet, type DuckConnection } from '../kline/duck-connection.js'
import {
  CHANGE_DOWN,
  CHANGE_UP,
  EFFECTIVE_CHANGE_PCT,
  EFFECTIVE_CLOSE,
  LISTABLE_STOCK_WHERE,
  MARKET_QUOTE_CTES,
  YI_YUAN,
  marketBoardSql,
} from './duck-query-utils.js'

export interface DuckIndustryStatsRow {
  industry: string
  stock_count: number
  avg_score: number | null
  avg_pe: number | null
  avg_pb: number | null
  up_count: number
  down_count: number
  flat_count: number
}

export interface DuckUniverseScreenQuery {
  trade_date?: string
  factor_conditions?: Array<{ factor: string; op: string; value: number }>
  industry_contains?: string
  industries?: string[]
  markets?: string[]
  min_total_score?: number
  max_total_score?: number
  min_market_cap_yi?: number
  max_market_cap_yi?: number
  min_pe?: number
  max_pe?: number
  min_pb?: number
  max_pb?: number
  exclude_st?: boolean
  scorecard?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  top_n?: number
}

export async function queryIndustryStatsDuck(
  conn: DuckConnection,
  tradeDate: string,
): Promise<{ trade_date: string; quote_date: string | null; items: DuckIndustryStatsRow[] }> {
  const quoteDateRow = await duckGet<{ d: string | null }>(conn, `
    SELECT MAX(trade_date) AS d FROM fact_quotes_daily
  `)
  const rows = await duckAll(conn, `
    ${MARKET_QUOTE_CTES}
    SELECT
      COALESCE(NULLIF(TRIM(s.industry), ''), '未分类') AS industry,
      COUNT(*)::INTEGER AS stock_count,
      AVG(sc.total_score) AS avg_score,
      AVG(q.pe) AS avg_pe,
      AVG(q.pb) AS avg_pb,
      SUM(CASE WHEN ${CHANGE_UP} THEN 1 ELSE 0 END)::INTEGER AS up_count,
      SUM(CASE WHEN ${CHANGE_DOWN} THEN 1 ELSE 0 END)::INTEGER AS down_count,
      SUM(CASE WHEN NOT ${CHANGE_UP} AND NOT ${CHANGE_DOWN} THEN 1 ELSE 0 END)::INTEGER AS flat_count
    FROM dim_cn_stocks s
    LEFT JOIN quotes q ON q.code = s.code
    LEFT JOIN klines k ON k.code = s.code
    LEFT JOIN fact_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
    WHERE ${LISTABLE_STOCK_WHERE} AND s.industry IS NOT NULL AND TRIM(s.industry) != ''
    GROUP BY COALESCE(NULLIF(TRIM(s.industry), ''), '未分类')
    HAVING COUNT(*) > 0
    ORDER BY up_count DESC, down_count ASC, stock_count DESC
  `, tradeDate) as unknown as DuckIndustryStatsRow[]
  return { trade_date: tradeDate, quote_date: quoteDateRow?.d ?? null, items: rows }
}

export async function queryIndustryStocksDuck(
  conn: DuckConnection,
  industry: string,
  tradeDate: string,
  limit: number,
): Promise<Array<{
  code: string
  name: string
  industry: string | null
  total_score: number | null
  price: number | null
  change_pct: number | null
}>> {
  const key = industry.trim()
  let industryClause: string
  const params: unknown[] = [tradeDate]
  if (key === '-' || key === '未分类' || key === '其他') {
    industryClause = `(s.industry IS NULL OR TRIM(s.industry) = '' OR s.industry = '-' OR s.industry = '未分类')`
  } else {
    industryClause = 's.industry = ?'
    params.push(key)
  }
  params.push(limit)
  return duckAll(conn, `
    ${MARKET_QUOTE_CTES}
    SELECT
      s.code,
      s.name,
      s.industry,
      sc.total_score,
      ${EFFECTIVE_CLOSE} AS price,
      ${EFFECTIVE_CHANGE_PCT} AS change_pct
    FROM dim_cn_stocks s
    LEFT JOIN quotes q ON q.code = s.code
    LEFT JOIN klines k ON k.code = s.code
    LEFT JOIN fact_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
    WHERE ${LISTABLE_STOCK_WHERE} AND ${industryClause}
    ORDER BY (${EFFECTIVE_CHANGE_PCT} IS NULL), ${EFFECTIVE_CHANGE_PCT} DESC, s.code ASC
    LIMIT ?
  `, ...params)
}

export async function queryUniverseScreenDuck(
  conn: DuckConnection,
  query: DuckUniverseScreenQuery,
  tradeDate: string,
): Promise<{
  trade_date: string
  passed: number
  total_universe: number
  scorecard: string
  items: Array<{
    code: string
    name: string
    industry: string | null
    total_score: number | null
    pe: number | null
    pb: number | null
    market_cap: number | null
    key_factors: Record<string, number | null>
  }>
}> {
  const scorecard = String(query.scorecard ?? '综合评估').trim() || '综合评估'
  const topN = Math.min(200, Math.max(1, Number(query.top_n ?? 40)))
  const excludeSt = query.exclude_st !== false
  const sortOrder = query.sort_order === 'asc' ? 'ASC' : 'DESC'
  const sortBy = query.sort_by ?? 'total_score'
  const conditions = query.factor_conditions ?? []

  const wheres = ["s.status = 'active'"]
  const whereParams: unknown[] = []
  if (excludeSt) wheres.push('(s.is_st IS NULL OR s.is_st = false)')

  if (query.industry_contains?.trim()) {
    wheres.push('s.industry LIKE ?')
    whereParams.push(`%${query.industry_contains.trim()}%`)
  }
  if (query.industries?.length) {
    const list = query.industries.map(i => i.trim()).filter(Boolean).slice(0, 20)
    if (list.length) {
      wheres.push(`s.industry IN (${list.map(() => '?').join(',')})`)
      whereParams.push(...list)
    }
  }
  if (query.markets?.length) {
    wheres.push(marketBoardSql(query.markets.map(m => String(m).toUpperCase())))
  }
  if (query.min_total_score != null) {
    wheres.push('sc.total_score >= ?')
    whereParams.push(Number(query.min_total_score))
  }
  if (query.max_total_score != null) {
    wheres.push('sc.total_score <= ?')
    whereParams.push(Number(query.max_total_score))
  }
  if (query.min_market_cap_yi != null) {
    wheres.push('q.market_cap >= ?')
    whereParams.push(Number(query.min_market_cap_yi) * YI_YUAN)
  }
  if (query.max_market_cap_yi != null) {
    wheres.push('q.market_cap <= ?')
    whereParams.push(Number(query.max_market_cap_yi) * YI_YUAN)
  }
  if (query.min_pe != null) {
    wheres.push('q.pe >= ?')
    whereParams.push(Number(query.min_pe))
  }
  if (query.max_pe != null) {
    wheres.push('q.pe <= ?')
    whereParams.push(Number(query.max_pe))
  }
  if (query.min_pb != null) {
    wheres.push('q.pb >= ?')
    whereParams.push(Number(query.min_pb))
  }
  if (query.max_pb != null) {
    wheres.push('q.pb <= ?')
    whereParams.push(Number(query.max_pb))
  }

  const joinParams: unknown[] = []
  let joinSql = ''
  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i]!
    const alias = `f${i}`
    joinSql += `
      INNER JOIN fact_factors ${alias}
        ON ${alias}.code = s.code
        AND ${alias}.trade_date = ?
        AND ${alias}.factor_name = ?
        AND ${alias}.factor_value ${c.op} ?
    `
    joinParams.push(tradeDate, c.factor, c.value)
  }

  let sortJoin = ''
  const sortJoinParams: unknown[] = []
  let orderExpr = 'sc.total_score'
  if (sortBy === 'pe') orderExpr = 'q.pe'
  else if (sortBy === 'pb') orderExpr = 'q.pb'
  else if (sortBy === 'market_cap') orderExpr = 'q.market_cap'
  else if (sortBy !== 'total_score') {
    sortJoin = `
      LEFT JOIN fact_factors fsort
        ON fsort.code = s.code AND fsort.trade_date = ? AND fsort.factor_name = ?
    `
    sortJoinParams.push(tradeDate, sortBy)
    orderExpr = 'fsort.factor_value'
  }

  const universeRow = await duckGet<{ c: number }>(conn, `
    SELECT COUNT(*)::INTEGER AS c FROM dim_cn_stocks s
    WHERE s.status = 'active' ${excludeSt ? 'AND (s.is_st IS NULL OR s.is_st = false)' : ''}
  `)

  const countRow = await duckGet<{ c: number }>(conn, `
    SELECT COUNT(DISTINCT s.code)::INTEGER AS c
    FROM dim_cn_stocks s
    ${joinSql}
    LEFT JOIN fact_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = ?
    LEFT JOIN fact_quotes_daily q ON q.code = s.code AND q.trade_date = ?
    WHERE ${wheres.join(' AND ')}
  `, ...joinParams, tradeDate, scorecard, tradeDate, ...whereParams)

  const rows = await duckAll<{
    code: string
    name: string
    industry: string | null
    total_score: number | null
    pe: number | null
    pb: number | null
    market_cap: number | null
  }>(conn, `
    SELECT DISTINCT
      s.code,
      s.name,
      s.industry,
      sc.total_score,
      q.pe,
      q.pb,
      q.market_cap
    FROM dim_cn_stocks s
    ${joinSql}
    LEFT JOIN fact_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = ?
    LEFT JOIN fact_quotes_daily q ON q.code = s.code AND q.trade_date = ?
    ${sortJoin}
    WHERE ${wheres.join(' AND ')}
    ORDER BY (${orderExpr} IS NULL), ${orderExpr} ${sortOrder}, s.code ASC
    LIMIT ?
  `, ...joinParams, tradeDate, scorecard, tradeDate, ...sortJoinParams, ...whereParams, topN)

  const factorNames = new Set(conditions.map(c => c.factor))
  if (!['total_score', 'pe', 'pb', 'market_cap'].includes(sortBy)) factorNames.add(sortBy)

  const items = []
  for (const row of rows) {
    const key_factors: Record<string, number | null> = {}
    for (const f of factorNames) {
      const fr = await duckGet<{ factor_value: number | null }>(conn, `
        SELECT factor_value FROM fact_factors
        WHERE trade_date = ? AND code = ? AND factor_name = ?
      `, tradeDate, row.code, f)
      key_factors[f] = fr?.factor_value ?? null
    }
    items.push({ ...row, key_factors })
  }

  return {
    trade_date: tradeDate,
    passed: countRow?.c ?? items.length,
    total_universe: universeRow?.c ?? 0,
    scorecard,
    items,
  }
}

export async function latestFactorDateDuck(conn: DuckConnection): Promise<string | null> {
  const row = await duckGet<{ d: string | null }>(conn, 'SELECT MAX(trade_date) AS d FROM fact_factors')
  return row?.d ?? null
}
