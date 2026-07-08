import { safeFloat } from '../../../utils/helpers.js'
import { fetchJson } from './http.js'
import { TENCENT_PROXY_BASE } from './types.js'

const INDUSTRY_HEAT_URL = `${TENCENT_PROXY_BASE}/ifzqgtimg/appstock/app/mktHs/rank`

export type TencentIndustryHeatTypeKey = 'averatio' | '01/averatio'

export type TencentIndustryHeatRow = {
  boardName: string
  boardCode: string
  boardPrice: number | null
  boardChangeAmt: number | null
  boardChangePct: number | null
  boardStrength: number | null
  leadingCode: string
  leadingName: string
  leadingPrice: number | null
  leadingChangeAmt: number | null
  leadingChangePct: number | null
  changePct5d: number | null
  changePct20d: number | null
}

type RawIndustryHeatRow = {
  bd_name?: string
  bd_code?: string
  bd_zxj?: string
  bd_zd?: string
  bd_zdf?: string
  bd_zs?: string
  nzg_code?: string
  nzg_name?: string
  nzg_zxj?: string
  nzg_zd?: string
  nzg_zdf?: string
  bd_zdf5?: string
  bd_zdf20?: string
}

type IndustryHeatEnvelope = {
  code: number
  msg?: string
  data?: RawIndustryHeatRow[]
}

/**
 * mstats 首页行业热度 `t` 参数。
 *
 * - averatio：行业平均涨跌幅排行
 * - 01/averatio：沪深 A 股 + 行业平均（首页「市场一览」Tab）
 */
export function resolveTencentIndustryHeatType(type: string): TencentIndustryHeatTypeKey {
  const key = type.trim()
  if (key === '01/averatio' || key === '01_averatio' || key === 'hs_averatio') return '01/averatio'
  return 'averatio'
}

/** o=0 涨幅榜，o=1 跌幅榜 */
export function resolveTencentIndustryHeatOrder(
  order: string | number = 'desc',
): '0' | '1' {
  const raw = String(order).trim().toLowerCase()
  if (raw === '1' || raw === 'asc' || raw === 'up' || raw === '跌幅' || raw === 'fall') return '1'
  return '0'
}

function bareLeadingCode(symbol: string): string {
  const raw = symbol.trim().toLowerCase()
  return raw.replace(/^(sh|sz|bj)/, '')
}

export function mapTencentIndustryHeatRows(rows: RawIndustryHeatRow[]): TencentIndustryHeatRow[] {
  return rows.map(row => ({
    boardName: String(row.bd_name ?? '').trim(),
    boardCode: String(row.bd_code ?? '').trim(),
    boardPrice: safeFloat(row.bd_zxj),
    boardChangeAmt: safeFloat(row.bd_zd),
    boardChangePct: safeFloat(row.bd_zdf),
    boardStrength: safeFloat(row.bd_zs),
    leadingCode: bareLeadingCode(String(row.nzg_code ?? '')),
    leadingName: String(row.nzg_name ?? '').trim(),
    leadingPrice: safeFloat(row.nzg_zxj),
    leadingChangeAmt: safeFloat(row.nzg_zd),
    leadingChangePct: safeFloat(row.nzg_zdf),
    changePct5d: safeFloat(row.bd_zdf5),
    changePct20d: safeFloat(row.bd_zdf20),
  })).filter(row => row.boardCode || row.boardName)
}

export function mapTencentIndustryHeatOutputRows(
  rows: TencentIndustryHeatRow[],
  type: TencentIndustryHeatTypeKey,
  order: '0' | '1',
): Record<string, unknown>[] {
  return rows.map(row => ({
    industryCode: row.boardCode,
    industryName: row.boardName,
    price: row.boardPrice,
    changeAmt: row.boardChangeAmt,
    changePct: row.boardChangePct,
    strength: row.boardStrength,
    changePct5d: row.changePct5d,
    changePct20d: row.changePct20d,
    leadingStock: {
      code: row.leadingCode,
      name: row.leadingName,
      price: row.leadingPrice,
      changeAmt: row.leadingChangeAmt,
      changePct: row.leadingChangePct,
    },
    heatType: type,
    order: order === '0' ? 'desc' : 'asc',
    market: 'CN',
    source: 'tencent_industry_heat',
  }))
}

/**
 * 拉取 mstats 首页行业热度排行。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank?l=10&p=1&t=averatio&o=0
 * @pageUrl https://stockapp.finance.qq.com/mstats/#
 */
export async function fetchTencentIndustryHeatRank(opts: {
  type?: string
  page?: number
  pageSize?: number
  order?: string | number
}): Promise<{
  type: TencentIndustryHeatTypeKey
  page: number
  pageSize: number
  order: '0' | '1'
  total: number
  items: Record<string, unknown>[]
}> {
  const type = resolveTencentIndustryHeatType(opts.type ?? 'averatio')
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 10, 50))
  const order = resolveTencentIndustryHeatOrder(opts.order ?? 'desc')

  const qs = new URLSearchParams({
    l: String(pageSize),
    p: String(page),
    t: type,
    o: order,
  })
  const body = await fetchJson<IndustryHeatEnvelope>(`${INDUSTRY_HEAT_URL}?${qs}`)
  if (body.code !== 0) {
    throw new Error(body.msg?.trim() || `Tencent industry heat failed (${body.code})`)
  }
  const rawRows = body.data ?? []
  const mapped = mapTencentIndustryHeatRows(rawRows)
  return {
    type,
    page,
    pageSize,
    order,
    total: mapped.length,
    items: mapTencentIndustryHeatOutputRows(mapped, type, order),
  }
}
