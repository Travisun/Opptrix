import type { MarketDataStore } from '../store.js'

const SUPPORTED_QUOTES = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB'] as const

export interface LocalCryptoScreenQuery {
  keyword?: string
  /** Quote currency filter — USDT, USDC, BTC, etc. */
  quote?: string
  base_contains?: string
  sort_by?: 'code' | 'name' | 'quote'
  sort_order?: 'asc' | 'desc'
  top_n?: number
}

export interface LocalCryptoScreenItem {
  code: string
  name: string | null
  market: string
  exchange: string | null
  base: string
  quote: string
}

export interface LocalCryptoScreenResult {
  total_universe: number
  passed: number
  items: LocalCryptoScreenItem[]
  available_quotes: string[]
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

/** Local Crypto pair filter — instruments table, multi-quote via code suffix */
export function localCryptoScreen(store: MarketDataStore, query: LocalCryptoScreenQuery): LocalCryptoScreenResult {
  const db = store.db
  const topN = Math.min(Math.max(query.top_n ?? 50, 1), 200)
  const sortOrder = query.sort_order === 'desc' ? 'DESC' : 'ASC'
  const wheres = [`asset_class = 'CRYPTO_SPOT'`, `market = 'CRYPTO'`, `status = 'active'`]
  const params: unknown[] = []

  if (query.keyword?.trim()) {
    wheres.push(`(UPPER(code) LIKE ? OR UPPER(name) LIKE ?)`)
    const like = `%${query.keyword.trim().toUpperCase()}%`
    params.push(like, like)
  }
  if (query.quote?.trim()) {
    wheres.push(`UPPER(code) LIKE ?`)
    params.push(`%/${query.quote.trim().toUpperCase()}`)
  }
  if (query.base_contains?.trim()) {
    wheres.push(`UPPER(code) LIKE ?`)
    params.push(`${query.base_contains.trim().toUpperCase()}%`)
  }

  const orderExpr = query.sort_by === 'name'
    ? 'name'
    : query.sort_by === 'quote'
      ? `substr(code, instr(code, '/') + 1)`
      : 'code'
  const whereSql = wheres.join(' AND ')

  const universeRow = db.prepare(`
    SELECT COUNT(*) AS c FROM instruments WHERE asset_class = 'CRYPTO_SPOT' AND market = 'CRYPTO' AND status = 'active'
  `).get() as { c: number }

  const quoteRows = db.prepare(`
    SELECT DISTINCT substr(code, instr(code, '/') + 1) AS quote
    FROM instruments
    WHERE asset_class = 'CRYPTO_SPOT' AND market = 'CRYPTO' AND status = 'active' AND instr(code, '/') > 0
    ORDER BY quote
  `).all() as { quote: string }[]

  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM instruments WHERE ${whereSql}`).get(...params) as { c: number }

  const rows = db.prepare(`
    SELECT code, name, market, exchange FROM instruments
    WHERE ${whereSql}
    ORDER BY ${orderExpr} ${sortOrder}
    LIMIT ?
  `).all(...params, topN) as LocalCryptoScreenItem[]

  const items = rows.map(row => {
    const { base, quote } = splitPairCode(row.code)
    return { ...row, base, quote }
  })

  return {
    total_universe: universeRow.c,
    passed: countRow.c,
    items,
    available_quotes: quoteRows.map(r => r.quote).filter(Boolean),
  }
}

export function buildLocalCryptoScreenSchema() {
  return {
    description: '本地 Crypto 交易对筛选 — 支持按计价币（USDT/USDC/BTC 等）过滤',
    prerequisite: '需先完成 crypto_list 同步',
    dimensions: {
      keyword: { type: 'string', note: '交易对或名称关键词' },
      quote: { type: 'string', enum: [...SUPPORTED_QUOTES], note: '计价币' },
      base_contains: { type: 'string', note: '基础币前缀，如 BTC、ETH' },
      sort_by: { enum: ['code', 'name', 'quote'], default: 'code' },
      top_n: { type: 'number', default: 50, max: 200 },
    },
  }
}

export { SUPPORTED_QUOTES as CRYPTO_SCREEN_QUOTES }
