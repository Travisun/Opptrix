/**
 * 最新日 K 截面分页 — NeoReader / KlineDuckStore / Gateway / duck-cli 共用。
 * 无参全量 API 保持不变；低配/大库用 afterCode 游标 + limit。
 */

export type LatestBarRow = {
  code: string
  close: number | null
  change_pct: number | null
}

export type LatestBarsPageOpts = {
  tradeDate?: string | null
  /** 游标：仅返回 code > afterCode 的行（按 code 升序） */
  afterCode?: string | null
  /** 默认 1000，硬顶 2000 */
  limit?: number
}

export const LATEST_BARS_PAGE_DEFAULT_LIMIT = 1000
export const LATEST_BARS_PAGE_MAX_LIMIT = 2000

export function clampLatestBarsPageLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return LATEST_BARS_PAGE_DEFAULT_LIMIT
  return Math.max(1, Math.min(Math.floor(limit), LATEST_BARS_PAGE_MAX_LIMIT))
}

/** 构建分页 SQL；字段恒为 code, close, change_pct */
export function buildLatestBarsPageQuery(
  table: string,
  opts: LatestBarsPageOpts = {},
): { sql: string; params: unknown[] } {
  const limit = clampLatestBarsPageLimit(opts.limit)
  const after = String(opts.afterCode ?? '').trim()
  const tradeDate = opts.tradeDate ? String(opts.tradeDate).slice(0, 10) : ''

  if (tradeDate) {
    const params: unknown[] = [tradeDate]
    let afterClause = ''
    if (after) {
      afterClause = ' AND code > ?'
      params.push(after)
    }
    params.push(limit)
    return {
      sql: `
        SELECT code, close, change_pct
        FROM ${table}
        WHERE trade_date = ?${afterClause}
        ORDER BY code
        LIMIT ?
      `,
      params,
    }
  }

  const params: unknown[] = []
  let afterClause = ''
  if (after) {
    afterClause = ' WHERE k.code > ?'
    params.push(after)
  }
  params.push(limit)
  return {
    sql: `
      SELECT k.code, k.close, k.change_pct
      FROM ${table} k
      INNER JOIN (
        SELECT code, MAX(trade_date) AS trade_date FROM ${table} GROUP BY code
      ) l ON k.code = l.code AND k.trade_date = l.trade_date
      ${afterClause}
      ORDER BY k.code
      LIMIT ?
    `,
    params,
  }
}
