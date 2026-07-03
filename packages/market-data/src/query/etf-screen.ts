import type { MarketDataStore } from '../store.js'

const YI_YUAN = 1e8

export interface LocalEtfScreenQuery {
  min_premium_rate?: number
  max_premium_rate?: number
  min_scale_yi?: number
  max_scale_yi?: number
  keyword?: string
  tracking_index_contains?: string
  fund_type_contains?: string
  sort_by?: 'premium_rate' | 'scale_yi' | 'nav' | 'code' | 'name'
  sort_order?: 'asc' | 'desc'
  top_n?: number
}

export interface LocalEtfScreenItem {
  code: string
  name: string
  premium_rate: number | null
  nav: number | null
  scale_yi: number | null
  tracking_index: string | null
  fund_type: string | null
}

export interface LocalEtfScreenResult {
  total_universe: number
  passed: number
  items: LocalEtfScreenItem[]
}

/** Latest NAV row per ETF + profile scale (元 → 亿元). */
export function localEtfScreen(store: MarketDataStore, query: LocalEtfScreenQuery): LocalEtfScreenResult {
  const db = store.db
  const topN = Math.min(Math.max(query.top_n ?? 50, 1), 200)
  const sortOrder = query.sort_order === 'asc' ? 'ASC' : 'DESC'

  const wheres: string[] = [
    `i.asset_class = 'ETF'`,
    `i.market = 'CN'`,
    `i.status = 'active'`,
  ]
  const params: unknown[] = []

  if (query.keyword?.trim()) {
    wheres.push(`(i.code LIKE ? OR i.name LIKE ?)`)
    const like = `%${query.keyword.trim()}%`
    params.push(like, like)
  }
  if (query.tracking_index_contains?.trim()) {
    wheres.push(`json_extract(p.profile_json, '$.trackingIndex') LIKE ?`)
    params.push(`%${query.tracking_index_contains.trim()}%`)
  }
  if (query.fund_type_contains?.trim()) {
    wheres.push(`json_extract(p.profile_json, '$.fundType') LIKE ?`)
    params.push(`%${query.fund_type_contains.trim()}%`)
  }
  if (query.min_premium_rate != null && Number.isFinite(query.min_premium_rate)) {
    wheres.push(`ln.premium_rate >= ?`)
    params.push(Number(query.min_premium_rate))
  }
  if (query.max_premium_rate != null && Number.isFinite(query.max_premium_rate)) {
    wheres.push(`ln.premium_rate <= ?`)
    params.push(Number(query.max_premium_rate))
  }

  const scaleExpr = `
    COALESCE(
      NULLIF(json_extract(p.profile_json, '$.scale'), 0),
      NULLIF(json_extract(p.profile_json, '$.totalShares'), 0) * NULLIF(COALESCE(ln.nav, json_extract(p.profile_json, '$.nav')), 0)
    ) / ${YI_YUAN}
  `

  if (query.min_scale_yi != null && Number.isFinite(query.min_scale_yi)) {
    wheres.push(`${scaleExpr} >= ?`)
    params.push(Number(query.min_scale_yi))
  }
  if (query.max_scale_yi != null && Number.isFinite(query.max_scale_yi)) {
    wheres.push(`${scaleExpr} <= ?`)
    params.push(Number(query.max_scale_yi))
  }

  let orderExpr = 'ln.premium_rate'
  switch (query.sort_by) {
    case 'scale_yi': orderExpr = scaleExpr; break
    case 'nav': orderExpr = 'ln.nav'; break
    case 'code': orderExpr = 'i.code'; break
    case 'name': orderExpr = 'i.name'; break
    default: orderExpr = 'ln.premium_rate'
  }

  const baseFrom = `
    FROM instruments i
    LEFT JOIN etf_profiles p ON p.code = i.code
    LEFT JOIN (
      SELECT code, nav, premium_rate, trade_date,
        ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
      FROM etf_nav_daily
    ) ln ON ln.code = i.code AND ln.rn = 1
    WHERE ${wheres.join(' AND ')}
  `

  const universeRow = db.prepare(`
    SELECT COUNT(*) AS c FROM instruments
    WHERE asset_class = 'ETF' AND market = 'CN' AND status = 'active'
  `).get() as { c: number }

  const countRow = db.prepare(`SELECT COUNT(*) AS c ${baseFrom}`).get(...params) as { c: number }

  const rows = db.prepare(`
    SELECT
      i.code,
      i.name,
      ln.nav,
      ln.premium_rate,
      ${scaleExpr} AS scale_yi,
      json_extract(p.profile_json, '$.trackingIndex') AS tracking_index,
      json_extract(p.profile_json, '$.fundType') AS fund_type
    ${baseFrom}
    ORDER BY (${orderExpr} IS NULL), ${orderExpr} ${sortOrder}, i.code ASC
    LIMIT ?
  `).all(...params, topN) as {
    code: string
    name: string
    nav: number | null
    premium_rate: number | null
    scale_yi: number | null
    tracking_index: string | null
    fund_type: string | null
  }[]

  return {
    total_universe: universeRow.c,
    passed: countRow.c,
    items: rows.map(r => ({
      code: r.code,
      name: r.name,
      premium_rate: r.premium_rate,
      nav: r.nav,
      scale_yi: r.scale_yi,
      tracking_index: r.tracking_index,
      fund_type: r.fund_type,
    })),
  }
}

export function buildLocalEtfScreenSchema() {
  return {
    description: '本地 CN ETF 筛选 — 基于 instruments + etf_profiles + etf_nav_daily',
    prerequisite: '需先完成 etf_list / etf_nav 同步；无溢价率时可能为 null',
    dimensions: {
      min_premium_rate: { type: 'number', unit: '%', note: '折溢价率下限，如 -1 表示折价不超过 1%' },
      max_premium_rate: { type: 'number', unit: '%', note: '折溢价率上限' },
      min_scale_yi: { type: 'number', unit: '亿元', note: '基金规模下限' },
      max_scale_yi: { type: 'number', unit: '亿元', note: '基金规模上限' },
      keyword: { type: 'string', note: '代码或名称模糊匹配' },
      tracking_index_contains: { type: 'string', note: '跟踪指数关键词' },
      fund_type_contains: { type: 'string', note: '基金类型关键词' },
      sort_by: { enum: ['premium_rate', 'scale_yi', 'nav', 'code', 'name'], default: 'premium_rate' },
      sort_order: { enum: ['asc', 'desc'], default: 'desc' },
      top_n: { type: 'number', default: 50, max: 200 },
    },
    examples: [
      { min_scale_yi: 10, max_premium_rate: 0.5, sort_by: 'premium_rate', top_n: 20 },
      { tracking_index_contains: '沪深300', min_scale_yi: 5 },
    ],
  }
}
