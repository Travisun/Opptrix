import type Database from 'better-sqlite3'
import type { MarketDataStore } from '../store.js'
import { SCREEN_PACK_FACTORS } from '../sync/config.js'
import { todayTradeDate } from '../utils.js'

const SCREEN_FACTOR_SET = new Set<string>(SCREEN_PACK_FACTORS)
const ALLOWED_OPS = new Set<ScreenCondition['op']>(['>', '<', '>=', '<=', '='])
const YI_YUAN = 1e8

export interface ScreenCondition {
  factor: string
  op: '>' | '<' | '>=' | '<=' | '='
  value: number
}

export interface LocalUniverseScreenQuery {
  factor_conditions?: ScreenCondition[]
  industry_contains?: string
  industries?: string[]
  markets?: Array<'SH' | 'SZ' | 'BJ'>
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
  trade_date?: string
  top_n?: number
}

export interface LocalScreenItem {
  code: string
  name: string
  total_score: number | null
  industry: string | null
  pe: number | null
  pb: number | null
  market_cap_yi?: number | null
  key_factors: Record<string, number | null>
}

export interface LocalUniverseScreenResult {
  trade_date: string
  passed: number
  total_universe: number
  scorecard: string
  items: LocalScreenItem[]
}

export function latestFactorDate(db: Database.Database): string | null {
  const row = db.prepare('SELECT MAX(trade_date) AS d FROM stock_factors').get() as { d: string | null }
  return row.d
}

export function latestQuoteDate(db: Database.Database): string | null {
  const row = db.prepare('SELECT MAX(trade_date) AS d FROM stock_quotes_daily').get() as { d: string | null }
  return row.d
}

/** CTEs: per-code latest quote/kline rows for change_pct (factor date may differ from quote date). */
const LATEST_MARKET_CTES = `
  WITH latest_quotes AS (
    SELECT code, MAX(trade_date) AS trade_date
    FROM stock_quotes_daily
    GROUP BY code
  ),
  quotes AS (
    SELECT q.code, q.close, q.change_pct, q.pe, q.pb, q.market_cap
    FROM stock_quotes_daily q
    INNER JOIN latest_quotes lq ON q.code = lq.code AND q.trade_date = lq.trade_date
  ),
  latest_klines AS (
    SELECT code, MAX(trade_date) AS trade_date
    FROM stock_klines_daily
    GROUP BY code
  ),
  klines AS (
    SELECT k.code, k.close, k.change_pct
    FROM stock_klines_daily k
    INNER JOIN latest_klines lk ON k.code = lk.code AND k.trade_date = lk.trade_date
  )
`

const EFFECTIVE_CHANGE_PCT = 'COALESCE(q.change_pct, k.change_pct)'
const EFFECTIVE_CLOSE = 'COALESCE(q.close, k.close)'

/** 可纳入行业/列表统计的活跃个股（排除退市等） */
const LISTABLE_STOCK_WHERE = `
  s.status = 'active'
  AND s.name NOT LIKE '退市%'
  AND TRIM(COALESCE(s.name, '')) != ''
`

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

function normalizeConditions(raw: ScreenCondition[] | undefined): ScreenCondition[] {
  if (!raw?.length) return []
  if (raw.length > 8) throw new Error('factor_conditions 最多 8 条')
  return raw.map((c, i) => {
    const factor = String(c.factor ?? '').trim()
    const op = c.op
    const value = Number(c.value)
    if (!factor || !SCREEN_FACTOR_SET.has(factor)) {
      throw new Error(`factor_conditions[${i}].factor 无效: ${factor || '(空)'}，请先调用 get_local_universe_screen_schema`)
    }
    if (!ALLOWED_OPS.has(op)) throw new Error(`factor_conditions[${i}].op 无效: ${op}`)
    if (!Number.isFinite(value)) throw new Error(`factor_conditions[${i}].value 须为数字`)
    return { factor, op, value }
  })
}

function marketBoardSql(markets: string[]): string {
  const parts: string[] = []
  for (const m of markets) {
    if (m === 'SH') parts.push("(s.code LIKE '60%' OR s.code LIKE '68%')")
    else if (m === 'SZ') parts.push("(s.code LIKE '00%' OR s.code LIKE '30%')")
    else if (m === 'BJ') parts.push("(s.code LIKE '43%' OR s.code LIKE '83%' OR s.code LIKE '87%' OR s.code LIKE '92%')")
  }
  return parts.length ? `(${parts.join(' OR ')})` : '1=1'
}

function hasActiveFilters(query: LocalUniverseScreenQuery, conditions: ScreenCondition[]): boolean {
  return conditions.length > 0
    || Boolean(query.industry_contains?.trim())
    || Boolean(query.industries?.length)
    || Boolean(query.markets?.length)
    || query.min_total_score != null
    || query.max_total_score != null
    || query.min_market_cap_yi != null
    || query.max_market_cap_yi != null
    || query.min_pe != null
    || query.max_pe != null
    || query.min_pb != null
    || query.max_pb != null
}

/** 多维度组合筛选本地初选股票池（因子 + 行业 + 评分 + 估值 + 市值 + 板块）。 */
export function localUniverseScreen(
  store: MarketDataStore,
  query: LocalUniverseScreenQuery,
): LocalUniverseScreenResult {
  const db = store.db
  const date = query.trade_date ?? latestFactorDate(db) ?? todayTradeDate()
  const conditions = normalizeConditions(query.factor_conditions)
  const scorecard = String(query.scorecard ?? '综合评估').trim() || '综合评估'
  const topN = Math.min(200, Math.max(1, Number(query.top_n ?? 40)))
  const excludeSt = query.exclude_st !== false
  const sortOrder = query.sort_order === 'asc' ? 'ASC' : 'DESC'
  const sortBy = query.sort_by ?? 'total_score'

  if (!hasActiveFilters(query, conditions)) {
    throw new Error('请至少提供 factor_conditions 或一项 filters（行业/板块/评分/估值/市值）')
  }

  const wheres = ["s.status = 'active'"]
  const whereParams: unknown[] = []
  if (excludeSt) wheres.push('s.is_st = 0')

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

  const scoreJoin = `LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = ?`
  const quoteJoin = `LEFT JOIN stock_quotes_daily q ON q.code = s.code AND q.trade_date = ?`
  const joinTailParams: unknown[] = [date, scorecard, date]

  let sortJoin = ''
  let sortJoinParams: unknown[] = []
  let orderExpr = 'sc.total_score'
  if (sortBy === 'pe') orderExpr = 'q.pe'
  else if (sortBy === 'pb') orderExpr = 'q.pb'
  else if (sortBy === 'market_cap') orderExpr = 'q.market_cap'
  else if (sortBy === 'total_score') orderExpr = 'sc.total_score'
  else if (SCREEN_FACTOR_SET.has(sortBy)) {
    sortJoin = `
      LEFT JOIN stock_factors fsort
        ON fsort.code = s.code AND fsort.trade_date = ? AND fsort.factor_name = ?
    `
    sortJoinParams = [date, sortBy]
    orderExpr = 'fsort.factor_value'
  }

  const universeRow = db.prepare(`
    SELECT COUNT(*) AS c FROM stocks s WHERE s.status = 'active' ${excludeSt ? 'AND s.is_st = 0' : ''}
  `).get() as { c: number }

  const countRow = db.prepare(`
    SELECT COUNT(DISTINCT s.code) AS c
    FROM stocks s
    ${joinSql}
    ${scoreJoin}
    ${quoteJoin}
    WHERE ${wheres.join(' AND ')}
  `).get(...joinParams, ...joinTailParams, ...whereParams) as { c: number }

  const rows = db.prepare(`
    SELECT DISTINCT
      s.code,
      s.name,
      s.industry,
      sc.total_score,
      q.pe,
      q.pb,
      q.market_cap
    FROM stocks s
    ${joinSql}
    ${scoreJoin}
    ${quoteJoin}
    ${sortJoin}
    WHERE ${wheres.join(' AND ')}
    ORDER BY (${orderExpr} IS NULL), ${orderExpr} ${sortOrder}, s.code ASC
    LIMIT ?
  `).all(
    ...joinParams,
    ...joinTailParams,
    ...sortJoinParams,
    ...whereParams,
    topN,
  ) as {
    code: string
    name: string
    industry: string | null
    total_score: number | null
    pe: number | null
    pb: number | null
    market_cap: number | null
  }[]

  const factorNames = new Set(conditions.map(c => c.factor))
  if (sortBy !== 'total_score' && sortBy !== 'pe' && sortBy !== 'pb' && sortBy !== 'market_cap') {
    factorNames.add(sortBy)
  }
  const factorStmt = db.prepare(
    'SELECT factor_value FROM stock_factors WHERE trade_date = ? AND code = ? AND factor_name = ?',
  )

  const items: LocalScreenItem[] = rows.map(row => {
    const key_factors: Record<string, number | null> = {}
    for (const f of factorNames) {
      const r = factorStmt.get(date, row.code, f) as { factor_value: number | null } | undefined
      key_factors[f] = r?.factor_value ?? null
    }
    return {
      code: row.code,
      name: row.name,
      total_score: row.total_score,
      industry: row.industry,
      pe: row.pe,
      pb: row.pb,
      market_cap_yi: row.market_cap != null ? Math.round((row.market_cap / YI_YUAN) * 100) / 100 : null,
      key_factors,
    }
  })

  return {
    trade_date: date,
    passed: countRow?.c ?? items.length,
    total_universe: universeRow?.c ?? 0,
    scorecard,
    items,
  }
}

export interface IndustryStockRow {
  code: string
  name: string
  industry: string | null
  total_score: number | null
  price: number | null
  change_pct: number | null
}

export function queryIndustryStats(store: MarketDataStore, tradeDate?: string) {
  const db = store.db
  const factorDate = tradeDate ?? latestFactorDate(db) ?? latestQuoteDate(db) ?? todayTradeDate()
  const quoteDate = latestQuoteDate(db)
  const rows = db.prepare(`
    ${LATEST_MARKET_CTES}
    SELECT
      COALESCE(NULLIF(TRIM(s.industry), ''), '未分类') AS industry,
      COUNT(*) AS stock_count,
      AVG(sc.total_score) AS avg_score,
      AVG(q.pe) AS avg_pe,
      AVG(q.pb) AS avg_pb,
      SUM(CASE WHEN ${EFFECTIVE_CHANGE_PCT} > 0 THEN 1 ELSE 0 END) AS up_count,
      SUM(CASE WHEN ${EFFECTIVE_CHANGE_PCT} < 0 THEN 1 ELSE 0 END) AS down_count,
      SUM(CASE WHEN ${EFFECTIVE_CHANGE_PCT} IS NULL OR ${EFFECTIVE_CHANGE_PCT} = 0 THEN 1 ELSE 0 END) AS flat_count
    FROM stocks s
    LEFT JOIN quotes q ON q.code = s.code
    LEFT JOIN klines k ON k.code = s.code
    LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
    WHERE ${LISTABLE_STOCK_WHERE} AND s.industry IS NOT NULL AND TRIM(s.industry) != ''
    GROUP BY COALESCE(NULLIF(TRIM(s.industry), ''), '未分类')
    HAVING COUNT(*) > 0
    ORDER BY up_count DESC, down_count ASC, stock_count DESC
  `).all(factorDate) as {
    industry: string
    stock_count: number
    avg_score: number | null
    avg_pe: number | null
    avg_pb: number | null
    up_count: number
    down_count: number
    flat_count: number
  }[]
  return { trade_date: factorDate, quote_date: quoteDate, items: rows }
}

export function queryIndustryStocks(
  store: MarketDataStore,
  industry: string,
  tradeDate?: string,
  limit = 120,
): { trade_date: string; industry: string; items: IndustryStockRow[] } {
  const factorDate = tradeDate ?? latestFactorDate(store.db) ?? latestQuoteDate(store.db) ?? todayTradeDate()
  const db = store.db
  const key = industry.trim()
  let industryClause: string
  const industryParams: string[] = []
  if (key === '-' || key === '未分类' || key === '其他') {
    industryClause = `(s.industry IS NULL OR TRIM(s.industry) = '' OR s.industry = '-' OR s.industry = '未分类')`
  } else {
    industryClause = 's.industry = ?'
    industryParams.push(key)
  }
  const cap = Math.min(Math.max(limit, 1), 200)
  const rows = db.prepare(`
    ${LATEST_MARKET_CTES}
    SELECT
      s.code,
      s.name,
      s.industry,
      sc.total_score,
      ${EFFECTIVE_CLOSE} AS price,
      ${EFFECTIVE_CHANGE_PCT} AS change_pct
    FROM stocks s
    LEFT JOIN quotes q ON q.code = s.code
    LEFT JOIN klines k ON k.code = s.code
    LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
    WHERE ${LISTABLE_STOCK_WHERE} AND ${industryClause}
    ORDER BY (${EFFECTIVE_CHANGE_PCT} IS NULL), ${EFFECTIVE_CHANGE_PCT} DESC, s.code ASC
    LIMIT ?
  `).all(factorDate, ...industryParams, cap) as {
    code: string
    name: string
    industry: string | null
    total_score: number | null
    price: number | null
    change_pct: number | null
  }[]

  return {
    trade_date: factorDate,
    industry: key,
    items: rows.map(row => ({
      code: row.code,
      name: row.name,
      industry: row.industry,
      total_score: row.total_score,
      price: row.price,
      change_pct: row.change_pct,
    })),
  }
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
