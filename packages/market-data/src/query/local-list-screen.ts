import type { AssetClass, Market } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'

export interface LocalListScreenQuery {
  market: Market
  assetClass: AssetClass
  keyword?: string
  industry_contains?: string
  quote?: string
  base_contains?: string
  sort_by?: 'code' | 'name' | 'quote'
  sort_order?: 'asc' | 'desc'
  top_n?: number
}

export interface LocalListScreenItem {
  code: string
  name: string | null
  market: string
  exchange: string | null
}

export interface LocalListScreenResult {
  total_universe: number
  passed: number
  items: LocalListScreenItem[]
}

function splitPairCode(code: string): { base: string; quote: string } {
  const raw = code.trim().toUpperCase()
  if (raw.includes('/')) {
    const [base, quote] = raw.split('/')
    return { base: base ?? raw, quote: quote ?? 'USDT' }
  }
  if (raw.includes('-')) {
    const [base, quote] = raw.split('-')
    return { base: base ?? raw, quote: quote ?? 'USDT' }
  }
  return { base: raw, quote: 'USDT' }
}

/** 泛化本地 instruments 列表筛选 — US/JP/KR/HK/Crypto 共用 */
export function localListScreen(store: MarketDataStore, query: LocalListScreenQuery): LocalListScreenResult {
  const db = store.db
  const topN = Math.min(Math.max(query.top_n ?? 50, 1), 200)
  const sortOrder = query.sort_order === 'desc' ? 'DESC' : 'ASC'
  const wheres = [`market = ?`, `asset_class = ?`, `status = 'active'`]
  const params: unknown[] = [query.market, query.assetClass]

  if (query.keyword?.trim()) {
    wheres.push(`(UPPER(code) LIKE ? OR UPPER(name) LIKE ?)`)
    const like = `%${query.keyword.trim().toUpperCase()}%`
    params.push(like, like)
  }
  if (query.industry_contains?.trim()) {
    wheres.push(`json_extract(extra, '$.industry') LIKE ?`)
    params.push(`%${query.industry_contains.trim()}%`)
  }
  if (query.quote?.trim() && query.assetClass === 'CRYPTO_SPOT') {
    wheres.push(`UPPER(code) LIKE ?`)
    params.push(`%/${query.quote.trim().toUpperCase()}`)
  }
  if (query.base_contains?.trim() && query.assetClass === 'CRYPTO_SPOT') {
    wheres.push(`UPPER(code) LIKE ?`)
    params.push(`${query.base_contains.trim().toUpperCase()}%`)
  }

  const orderExpr = query.sort_by === 'name'
    ? 'name'
    : query.sort_by === 'quote' && query.assetClass === 'CRYPTO_SPOT'
      ? `substr(code, instr(code, '/') + 1)`
      : 'code'
  const whereSql = wheres.join(' AND ')

  const universeRow = db.prepare(`
    SELECT COUNT(*) AS c FROM instruments WHERE market = ? AND asset_class = ? AND status = 'active'
  `).get(query.market, query.assetClass) as { c: number }

  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM instruments WHERE ${whereSql}`).get(...params) as { c: number }

  const rows = db.prepare(`
    SELECT code, name, market, exchange FROM instruments
    WHERE ${whereSql}
    ORDER BY ${orderExpr} ${sortOrder}
    LIMIT ?
  `).all(...params, topN) as LocalListScreenItem[]

  if (query.assetClass === 'CRYPTO_SPOT') {
    return {
      total_universe: universeRow.c,
      passed: countRow.c,
      items: rows.map(row => {
        const { base, quote } = splitPairCode(row.code)
        return { ...row, code: row.code, name: row.name ?? `${base}/${quote}` }
      }),
    }
  }

  return { total_universe: universeRow.c, passed: countRow.c, items: rows }
}

export function buildLocalListScreenSchema(market: Market, assetClass: AssetClass) {
  const base = {
    description: `本地 ${market} ${assetClass} 列表筛选 — instruments 表`,
    prerequisite: `需先完成 ${market.toLowerCase()}_list 同步`,
    dimensions: {
      keyword: { type: 'string', note: '代码或名称' },
      industry_contains: { type: 'string', note: '行业关键词（extra.industry）' },
      sort_by: { enum: ['code', 'name'], default: 'code' },
      top_n: { type: 'number', default: 50, max: 200 },
    },
  }
  if (assetClass === 'CRYPTO_SPOT') {
    return {
      ...base,
      dimensions: {
        ...base.dimensions,
        quote: { type: 'string', note: '计价币 USDT/BTC 等' },
        base_contains: { type: 'string', note: '基础币前缀' },
        sort_by: { enum: ['code', 'name', 'quote'], default: 'code' },
      },
    }
  }
  return base
}
