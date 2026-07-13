import { normalizeCode, resolveMarket } from '@opptrix/a-stock-layer'
import type { StockListItem } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { marketReadAll } from './duck-read.js'

const SEARCHABLE_WHERE = `
  status IN ('active', 'st')
  AND name NOT LIKE '退市%'
  AND TRIM(COALESCE(name, '')) != ''
`

type StockRow = {
  code: string
  name: string
  industry: string | null
  market: string | null
}

function mapRows(rows: StockRow[]): StockListItem[] {
  return rows.map(row => ({
    code: normalizeCode(row.code),
    name: row.name,
    industry: row.industry?.trim() ?? '',
    market: row.market?.trim() || resolveMarket(row.code),
  }))
}

/** Search synced universe — DuckDB 优先，SQLite 回退 */
export function searchUniverseStocks(
  store: MarketDataStore,
  keyword: string,
  limit = 30,
): StockListItem[] {
  const raw = keyword.trim()
  if (raw.length < 2) return []

  const cap = Math.min(Math.max(limit, 1), 50)
  const db = store.db

  if (/^\d+$/.test(raw)) {
    const codePrefix = `${raw}%`
    const codeExact = raw.length >= 6 ? normalizeCode(raw) : ''
    const sql = `
      SELECT code, name, industry, market FROM stocks
      WHERE ${SEARCHABLE_WHERE} AND code LIKE ?
      ORDER BY
        CASE WHEN ? != '' AND code = ? THEN 0 WHEN code LIKE ? THEN 1 ELSE 2 END,
        LENGTH(code), code
      LIMIT ?
    `
    const params = [codePrefix, codeExact, codeExact, codePrefix, cap]
    return mapRows(marketReadAll(store, sql, params, () => db.prepare(sql).all(...params) as StockRow[]))
  }

  const like = `%${raw}%`
  const prefix = `${raw}%`
  const sql = `
    SELECT code, name, industry, market FROM stocks
    WHERE ${SEARCHABLE_WHERE}
      AND (name LIKE ? OR code LIKE ? OR industry LIKE ?)
    ORDER BY
      CASE
        WHEN name = ? THEN 0 WHEN name LIKE ? THEN 1
        WHEN code LIKE ? THEN 2 WHEN industry LIKE ? THEN 3 ELSE 4
      END, code
    LIMIT ?
  `
  const params = [like, like, like, raw, prefix, like, like, cap]
  return mapRows(marketReadAll(store, sql, params, () => db.prepare(sql).all(...params) as StockRow[]))
}
