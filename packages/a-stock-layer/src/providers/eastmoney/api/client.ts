/**
 * 东方财富公开 API 客户端。
 *
 * - datacenter-web：融资融券、北向资金等报表
 * - push2 / push2delay / push2his：个股/大盘/板块资金流
 */

import { resolveSecId } from '../../../utils/helpers.js'
import { fetchEmJson } from './http.js'
import {
  EM_BOARD_FS,
  EM_CLIST_FIELDS,
  EM_DATACENTER,
  EM_FFLOW_FIELDS1,
  EM_FFLOW_FIELDS2,
  EM_FLOW_STAT_FID,
  EM_MARGIN_MARKET,
  EM_PUSH2,
  EM_PUSH2HIS,
  EM_REFERER,
  EM_STOCK_RANK_FS,
  EM_UT,
  EM_UT_CLIST,
  type EmDatacenterResponse,
  type EmPush2Response,
} from './types.js'

/** push2 主站偶发 502；daykline 优先 delay/his */
const PUSH2_HOSTS = ['https://push2delay.eastmoney.com', EM_PUSH2] as const
const FFLOW_DAY_HOSTS = [
  'https://push2delay.eastmoney.com',
  EM_PUSH2HIS,
  EM_PUSH2,
] as const

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    sp.set(k, String(v))
  }
  return sp.toString()
}

async function fetchPushJson(pathAndQuery: string, hosts: readonly string[]): Promise<EmPush2Response> {
  let lastErr: unknown
  for (const host of hosts) {
    try {
      return await fetchEmJson<EmPush2Response>(`${host}${pathAndQuery}`)
    } catch (err) {
      lastErr = err
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`EastMoney push2 全部主机失败: ${detail}`)
}

/** 拉取日 K 资金流：优先返回非空 klines 的主机 */
async function fetchFflowDayJson(pathAndQuery: string): Promise<EmPush2Response> {
  let lastOk: EmPush2Response | null = null
  let lastErr: unknown
  for (const host of FFLOW_DAY_HOSTS) {
    try {
      const json = await fetchEmJson<EmPush2Response>(`${host}${pathAndQuery}`)
      const n = json.data?.klines?.length ?? 0
      if (n > 0) return json
      lastOk = json
    } catch (err) {
      lastErr = err
    }
  }
  if (lastOk) return lastOk
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`EastMoney fflow daykline 全部主机失败: ${detail}`)
}

/** datacenter-web 报表分页查询 */
export async function emDatacenterGet(opts: {
  reportName: string
  filter?: string
  pageNumber?: number
  pageSize?: number
  sortColumns?: string
  sortTypes?: number | string
  columns?: string
  token?: string
}): Promise<Record<string, unknown>[]> {
  const url = `${EM_DATACENTER}?${qs({
    reportName: opts.reportName,
    columns: opts.columns ?? 'ALL',
    source: 'WEB',
    client: 'WEB',
    pageNumber: opts.pageNumber ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 500),
    sortColumns: opts.sortColumns,
    sortTypes: opts.sortTypes,
    filter: opts.filter,
    token: opts.token,
  })}`
  const json = await fetchEmJson<EmDatacenterResponse>(url, EM_REFERER)
  if (json.success === false) return []
  const rows = json.result?.data
  return Array.isArray(rows) ? rows : []
}

/** 个股/指数日级资金流 K（历史） */
export async function emFflowDayKline(
  secid: string,
  limit = 30,
): Promise<{ name?: string; klines: string[] }> {
  const q = qs({
    lmt: Math.min(Math.max(limit, 1), 120),
    klt: 101,
    secid,
    fields1: EM_FFLOW_FIELDS1,
    fields2: EM_FFLOW_FIELDS2,
    ut: EM_UT,
  })
  const json = await fetchFflowDayJson(`/api/qt/stock/fflow/daykline/get?${q}`)
  const data = json.data
  return {
    name: data?.name,
    klines: Array.isArray(data?.klines) ? data!.klines! : [],
  }
}

/** 当日分时资金流 K */
export async function emFflowMinuteKline(secid: string): Promise<string[]> {
  const q = qs({
    lmt: 0,
    klt: 1,
    secid,
    fields1: EM_FFLOW_FIELDS1,
    fields2: EM_FFLOW_FIELDS2,
    ut: EM_UT,
  })
  const json = await fetchPushJson(`/api/qt/stock/fflow/kline/get?${q}`, PUSH2_HOSTS)
  return Array.isArray(json.data?.klines) ? json.data!.klines! : []
}

/** 多标的实时资金流摘要（ulist） */
export async function emUlistMoneyFlow(secids: string[]): Promise<Record<string, unknown>[]> {
  if (!secids.length) return []
  const q = qs({
    fltt: 2,
    secids: secids.join(','),
    fields:
      'f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f64,f65,f70,f71,f76,f77,f82,f83,f164,f166,f168,f170,f172,f252,f253,f254,f255,f256,f124,f6,f2,f3,f12,f14',
    ut: EM_UT,
  })
  const json = await fetchPushJson(`/api/qt/ulist.np/get?${q}`, PUSH2_HOSTS)
  return Array.isArray(json.data?.diff) ? json.data!.diff! : []
}

/** clist 通用（个股主力排名 / 板块资金流） */
export async function emClist(opts: {
  fs: string
  fid?: string
  pn?: number
  pz?: number
  po?: number
}): Promise<Record<string, unknown>[]> {
  const q = qs({
    fid: opts.fid ?? 'f62',
    po: opts.po ?? 1,
    pz: Math.min(Math.max(opts.pz ?? 50, 1), 100),
    pn: Math.max(opts.pn ?? 1, 1),
    np: 1,
    fltt: 2,
    invt: 2,
    ut: EM_UT_CLIST,
    fs: opts.fs,
    fields: EM_CLIST_FIELDS,
  })
  const json = await fetchPushJson(`/api/qt/clist/get?${q}`, PUSH2_HOSTS)
  return Array.isArray(json.data?.diff) ? json.data!.diff! : []
}

export function resolveBoardFs(sectorType: string): string {
  const key = String(sectorType ?? '').trim().toLowerCase()
  return EM_BOARD_FS[key] ?? EM_BOARD_FS.industry!
}

export function resolveStockRankFs(market: string): string {
  const key = String(market ?? 'hsa').trim().toLowerCase()
  return EM_STOCK_RANK_FS[key] ?? EM_STOCK_RANK_FS.hsa!
}

export function resolveFlowStatFid(stat: string): string {
  const key = String(stat ?? '1').trim().toLowerCase()
  return EM_FLOW_STAT_FID[key] ?? EM_FLOW_STAT_FID['1']!
}

export function resolveMarginScdm(market: string): string | null {
  const key = String(market ?? '').trim().toLowerCase()
  return EM_MARGIN_MARKET[key] ?? null
}

export async function emStockMoneyFlowHistory(
  code: string,
  limit = 30,
): Promise<{ name?: string; klines: string[] }> {
  return emFflowDayKline(resolveSecId(code), limit)
}

export async function emMarketFflowHistory(
  indexCode: string,
  limit = 30,
): Promise<{ name?: string; klines: string[] }> {
  return emFflowDayKline(resolveSecId(indexCode), limit)
}

/** 沪深京两融合计历史 */
export async function emMarginMarketTotal(page = 1, pageSize = 50): Promise<Record<string, unknown>[]> {
  return emDatacenterGet({
    reportName: 'RPTA_RZRQ_LSHJ',
    pageNumber: page,
    pageSize,
    sortColumns: 'DIM_DATE',
    sortTypes: -1,
  })
}

/** 分市场两融历史 SCDM=007/001/002 */
export async function emMarginMarketByExchange(
  market: string,
  page = 1,
  pageSize = 50,
): Promise<Record<string, unknown>[]> {
  const scdm = resolveMarginScdm(market)
  if (!scdm) return []
  return emDatacenterGet({
    reportName: 'RPTA_WEB_RZRQ_LSSH',
    filter: `(SCDM="${scdm}")`,
    pageNumber: page,
    pageSize,
    sortColumns: 'DIM_DATE',
    sortTypes: -1,
  })
}

/** 个股两融明细历史 */
export async function emMarginStockHistory(
  code: string,
  page = 1,
  pageSize = 50,
): Promise<Record<string, unknown>[]> {
  const bare = code.replace(/\D/g, '').padStart(6, '0')
  if (!/^\d{6}$/.test(bare)) return []
  return emDatacenterGet({
    reportName: 'RPTA_WEB_RZRQ_GGMX',
    filter: `(SCODE="${bare}")`,
    pageNumber: page,
    pageSize,
    sortColumns: 'DATE',
    sortTypes: -1,
  })
}

/** 北向/南向成交统计（RPT_MUTUAL_DEAL_STATISTICS） */
export async function emMutualDealStats(
  page = 1,
  pageSize = 30,
): Promise<Record<string, unknown>[]> {
  return emDatacenterGet({
    reportName: 'RPT_MUTUAL_DEAL_STATISTICS',
    pageNumber: page,
    pageSize,
    sortColumns: 'TRADE_DATE',
    sortTypes: -1,
  })
}
