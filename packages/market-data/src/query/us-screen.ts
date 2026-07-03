import type { MarketDataStore } from '../store.js'

export interface LocalUsScreenQuery {
  keyword?: string
  industry_contains?: string
  sort_by?: 'code' | 'name'
  sort_order?: 'asc' | 'desc'
  top_n?: number
}

export interface LocalUsScreenItem {
  code: string
  name: string | null
  market: string
  exchange: string | null
}

export interface LocalUsScreenResult {
  total_universe: number
  passed: number
  items: LocalUsScreenItem[]
}

/** Local US equity list filter — instruments only, no live factors yet */
export function localUsScreen(store: MarketDataStore, query: LocalUsScreenQuery): LocalUsScreenResult {
  const db = store.db
  const topN = Math.min(Math.max(query.top_n ?? 50, 1), 200)
  const sortOrder = query.sort_order === 'desc' ? 'DESC' : 'ASC'
  const wheres = [`asset_class = 'EQUITY'`, `market = 'US'`, `status = 'active'`]
  const params: unknown[] = []

  if (query.keyword?.trim()) {
    wheres.push(`(UPPER(code) LIKE ? OR UPPER(name) LIKE ?)`)
    const like = `%${query.keyword.trim().toUpperCase()}%`
    params.push(like, like)
  }
  if (query.industry_contains?.trim()) {
    wheres.push(`json_extract(extra, '$.industry') LIKE ?`)
    params.push(`%${query.industry_contains.trim()}%`)
  }

  const orderExpr = query.sort_by === 'name' ? 'name' : 'code'
  const whereSql = wheres.join(' AND ')

  const universeRow = db.prepare(`
    SELECT COUNT(*) AS c FROM instruments WHERE asset_class = 'EQUITY' AND market = 'US' AND status = 'active'
  `).get() as { c: number }

  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM instruments WHERE ${whereSql}`).get(...params) as { c: number }

  const rows = db.prepare(`
    SELECT code, name, market, exchange FROM instruments
    WHERE ${whereSql}
    ORDER BY ${orderExpr} ${sortOrder}
    LIMIT ?
  `).all(...params, topN) as LocalUsScreenItem[]

  return { total_universe: universeRow.c, passed: countRow.c, items: rows }
}

export function buildLocalUsScreenSchema() {
  return {
    description: '本地美股列表筛选 — 基于 instruments（us_list 同步），无在线因子',
    prerequisite: '需先完成 us_list 同步',
    dimensions: {
      keyword: { type: 'string', note: 'ticker 或公司名' },
      industry_contains: { type: 'string', note: '行业关键词（extra.industry）' },
      sort_by: { enum: ['code', 'name'], default: 'code' },
      top_n: { type: 'number', default: 50, max: 200 },
    },
  }
}
