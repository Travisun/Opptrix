/**
 * 最新日 K 截面分页 — NeoReader / KlineDuckStore / Gateway / duck-cli 共用。
 * 无参全量 API 保持不变（测试/兼容）；Hub / 热路径用 afterCode 游标 + limit 拼回。
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
/** 低配机器默认页大小（仍可显式传入 limit） */
export const LATEST_BARS_PAGE_LOW_MEM_LIMIT = 500
export const LATEST_BARS_PAGE_MAX_LIMIT = 2000

export function clampLatestBarsPageLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return LATEST_BARS_PAGE_DEFAULT_LIMIT
  return Math.max(1, Math.min(Math.floor(limit), LATEST_BARS_PAGE_MAX_LIMIT))
}

/**
 * 解析热路径页大小：显式 limit > env OPPTRIX_LATEST_BARS_PAGE_LIMIT > 低配 500 > 默认 1000。
 */
export function resolveLatestBarsPageLimit(opts?: {
  limit?: number
  lowMem?: boolean
}): number {
  if (opts?.limit != null && Number.isFinite(opts.limit)) {
    return clampLatestBarsPageLimit(opts.limit)
  }
  const raw = process.env.OPPTRIX_LATEST_BARS_PAGE_LIMIT
  if (raw != null && String(raw).trim() !== '') {
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isFinite(n)) return clampLatestBarsPageLimit(n)
  }
  if (opts?.lowMem) return LATEST_BARS_PAGE_LOW_MEM_LIMIT
  return LATEST_BARS_PAGE_DEFAULT_LIMIT
}

export type LatestBarsStitchOpts = {
  tradeDate?: string | null
  /** 每页 limit；默认经 resolveLatestBarsPageLimit */
  limit?: number
}

/**
 * 分页拼回全量截面（每页有界；拼完 ≡ 无参全量 API 结果集，按 code 升序）。
 * 热路径请用此 helper + latestBarsPage*，勿一次无界 SELECT。
 */
export async function stitchLatestBarsPages(
  fetchPage: (opts: LatestBarsPageOpts) => Promise<LatestBarRow[]>,
  opts: LatestBarsStitchOpts = {},
): Promise<LatestBarRow[]> {
  const limit = clampLatestBarsPageLimit(opts.limit ?? resolveLatestBarsPageLimit())
  const out: LatestBarRow[] = []
  let afterCode: string | null = null
  for (;;) {
    const page = await fetchPage({
      tradeDate: opts.tradeDate,
      afterCode,
      limit,
    })
    if (!page.length) break
    out.push(...page)
    const last = page[page.length - 1]
    if (!last) break
    afterCode = last.code
    if (page.length < limit) break
  }
  return out
}

/** 同步分页拼回（测试 / 导出 / duck-cli 边界） */
export function stitchLatestBarsPagesSync(
  fetchPage: (opts: LatestBarsPageOpts) => LatestBarRow[],
  opts: LatestBarsStitchOpts = {},
): LatestBarRow[] {
  const limit = clampLatestBarsPageLimit(opts.limit ?? resolveLatestBarsPageLimit())
  const out: LatestBarRow[] = []
  let afterCode: string | null = null
  for (;;) {
    const page = fetchPage({
      tradeDate: opts.tradeDate,
      afterCode,
      limit,
    })
    if (!page.length) break
    out.push(...page)
    const last = page[page.length - 1]
    if (!last) break
    afterCode = last.code
    if (page.length < limit) break
  }
  return out
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
