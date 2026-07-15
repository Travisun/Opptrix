/**
 * 东财主力数据 · 个股机构持仓（zlsj/detail）。
 * 页面：https://data.eastmoney.com/zlsj/detail/{code}.html
 */

import { emDatacenterGet } from './client.js'
import { fetchEmJson } from './http.js'
import { EM_REFERER } from './types.js'

const ZLSJ_DETAIL = 'https://data.eastmoney.com/dataapi/zlsj/detail'
const ZLSJ_PAGE = (code: string) => `https://data.eastmoney.com/zlsj/detail/${code}.html`

/** 页面 Tab data-type → 机构属性 */
export const EM_INST_ORG_TYPES = [
  { key: 'fund', shType: '1', name: '基金' },
  { key: 'qfii', shType: '2', name: 'QFII' },
  { key: 'social', shType: '3', name: '社保' },
  { key: 'broker', shType: '4', name: '券商' },
  { key: 'insurance', shType: '5', name: '保险' },
  { key: 'trust', shType: '6', name: '信托' },
] as const

export type EmInstOrgKey = (typeof EM_INST_ORG_TYPES)[number]['key'] | 'all'

export function resolveInstOrgType(input: string | number): { key: EmInstOrgKey; shType: string; name: string } {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw || raw === 'all' || raw === '0' || raw === '全部') {
    return { key: 'all', shType: '', name: '全部' }
  }
  const byKey = EM_INST_ORG_TYPES.find(t => t.key === raw || t.shType === raw || t.name.toLowerCase() === raw)
  if (byKey) return { key: byKey.key, shType: byKey.shType, name: byKey.name }
  // 中文别名
  const aliases: Record<string, EmInstOrgKey> = {
    '基金': 'fund', '公募': 'fund',
    'qfii': 'qfii', '合格境外': 'qfii',
    '社保': 'social', '社保持仓': 'social',
    '券商': 'broker', '证券': 'broker',
    '保险': 'insurance',
    '信托': 'trust',
  }
  for (const [a, k] of Object.entries(aliases)) {
    if (raw.includes(a.toLowerCase()) || a.includes(raw)) {
      const hit = EM_INST_ORG_TYPES.find(t => t.key === k)!
      return { key: hit.key, shType: hit.shType, name: hit.name }
    }
  }
  return { key: 'all', shType: '', name: '全部' }
}

function clampPage(page: number): number {
  return Math.max(1, Number(page) || 1)
}

function clampSize(size: number, max = 100): number {
  return Math.min(max, Math.max(1, Number(size) || 30))
}

function ymd(raw: unknown): string {
  return String(raw ?? '').slice(0, 10)
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    sp.set(k, String(v))
  }
  return sp.toString()
}

/** 可用季报日期列表（全市场共用） */
export async function emFetchInstHoldReportDates(limit = 25): Promise<Record<string, unknown>[]> {
  return emDatacenterGet({
    reportName: 'RPT_MAIN_REPORTDATE',
    columns: 'ALL',
    pageNumber: 1,
    pageSize: clampSize(limit, 50),
    sortColumns: 'REPORT_DATE',
    sortTypes: -1,
  })
}

/** 最新可用 REPORT_DATE YYYY-MM-DD */
export async function emResolveLatestInstHoldDate(): Promise<string | null> {
  const rows = await emFetchInstHoldReportDates(5)
  const d = ymd(rows[0]?.REPORT_DATE)
  return d || null
}

/**
 * 季报机构持仓一览（按机构属性汇总）
 * @pageUrl https://data.eastmoney.com/zlsj/detail/002851.html
 */
export async function emFetchInstHoldOverview(
  code: string,
  reportDate?: string,
): Promise<{ reportDate: string; rows: Record<string, unknown>[] }> {
  const bare = code.replace(/\D/g, '').padStart(6, '0')
  const date = reportDate?.trim() || (await emResolveLatestInstHoldDate()) || ''
  if (!/^\d{6}$/.test(bare) || !date) return { reportDate: date, rows: [] }
  const rows = await emDatacenterGet({
    reportName: 'RPT_MAIN_ORGHOLD',
    filter: `(SECURITY_CODE="${bare}")(REPORT_DATE='${date}')`,
    pageNumber: 1,
    pageSize: 20,
  })
  return { reportDate: date, rows }
}

export interface EmInstHoldDetailResult {
  reportDate: string
  orgKey: EmInstOrgKey
  orgName: string
  pages: number
  rows: Record<string, unknown>[]
  pageUrl: string
}

/**
 * 分类型持仓明细（页面对应 6 个 Tab；orgType=all 时不传 SHType）
 */
export async function emFetchInstHoldDetail(
  code: string,
  orgType: string | number = 'fund',
  reportDate?: string,
  page = 1,
  pageSize = 30,
): Promise<EmInstHoldDetailResult> {
  const bare = code.replace(/\D/g, '').padStart(6, '0')
  const org = resolveInstOrgType(orgType)
  const date = reportDate?.trim() || (await emResolveLatestInstHoldDate()) || ''
  const empty: EmInstHoldDetailResult = {
    reportDate: date,
    orgKey: org.key,
    orgName: org.name,
    pages: 0,
    rows: [],
    pageUrl: ZLSJ_PAGE(bare),
  }
  if (!/^\d{6}$/.test(bare) || !date) return empty

  const url = `${ZLSJ_DETAIL}?${qs({
    SHType: org.shType,
    SHCode: '',
    SCode: bare,
    ReportDate: date,
    sortField: 'TOTAL_SHARES',
    sortDirec: 1,
    pageNum: clampPage(page),
    pageSize: clampSize(pageSize),
  })}`
  const json = await fetchEmJson<unknown>(url, EM_REFERER)
  // 无数据时上游偶发直接返回 []
  if (Array.isArray(json)) {
    return { ...empty, rows: [] }
  }
  if (!json || typeof json !== 'object') return empty
  const body = json as { success?: boolean; data?: unknown; pages?: number }
  const rows = Array.isArray(body.data) ? body.data as Record<string, unknown>[] : []
  return {
    reportDate: date,
    orgKey: org.key,
    orgName: org.name,
    pages: Number(body.pages) || 0,
    rows,
    pageUrl: ZLSJ_PAGE(bare),
  }
}
