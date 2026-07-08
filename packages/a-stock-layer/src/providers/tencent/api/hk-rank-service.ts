import { safeFloat } from '../../../utils/helpers.js'
import { fetchJson, fetchText } from './http.js'
import { parseTencentJsonp } from './jsonp.js'
import { TENCENT_PROXY_BASE } from './types.js'
import type { TencentBoardRankRow } from './types.js'

const HK_RANK_URL = 'https://stock.gtimg.cn/data/hk_rank.php'
const HK_PROXY_LIST_URL = `${TENCENT_PROXY_BASE}/cgi/cgi-bin/rank/hk/getList`

/**
 * mstats `listTPL.HK` 板块 type → hk_rank.php board 参数。
 */
export const TENCENT_HK_BOARD_MAP = {
  MB: 'main_all',
  MBHSCEI: 'main_China',
  MBHSCCI: 'main_red',
  GEM: 'gem_all',
  GEMHSCEI: 'gem_China',
  GEMHSCCI: 'gem_red',
  IDX: 'index',
  HSI: 'HSI_composite',
  HSCEI: 'China_composite',
  HSCEIB: 'China_board',
  HSCCI: 'red_composite',
  AH: 'A_H',
  WRNT: 'warrant_all',
  CALL: 'warrant_call',
  PUT: 'warrant_put',
  CBBC: 'niuxiong_all',
  BULL: 'niuxiong_niu',
  BEAR: 'niuxiong_xiong',
} as const

export type TencentHkBoardKey = keyof typeof TENCENT_HK_BOARD_MAP

/** mstats 列序号 → hk_rank metric 字段名 */
const SORT_TO_METRIC: Record<number, string> = {
  3: 'price',
  4: 'pre_close',
  5: 'open',
  9: 'buy',
  19: 'sell',
  31: 'change_amount',
  32: 'change_rate',
  33: 'high',
  34: 'low',
  36: 'volume',
  37: 'amount',
}

const METRIC_ALIAS: Record<string, string> = {
  price: 'price',
  zxj: 'price',
  pre_close: 'pre_close',
  preclose: 'pre_close',
  open: 'open',
  buy: 'buy',
  sell: 'sell',
  change_amount: 'change_amount',
  zde: 'change_amount',
  change_rate: 'change_rate',
  changeratio: 'change_rate',
  zdf: 'change_rate',
  high: 'high',
  low: 'low',
  volume: 'volume',
  amount: 'amount',
}

const PROXY_SORT_ALIAS: Record<string, string> = {
  price: 'price',
  zxj: 'price',
  change_rate: 'priceRatio',
  zdf: 'priceRatio',
  changeratio: 'priceRatio',
  change_amount: 'priceChange',
  zde: 'priceChange',
  volume: 'volume',
  amount: 'turnover',
}

export type TencentHkStockRow = {
  code: string
  name: string
  price: number | null
  preClose: number | null
  open: number | null
  high: number | null
  low: number | null
  buy: number | null
  sell: number | null
  changeAmt: number | null
  changePct: number | null
  volume: number | null
  amount: number | null
  market: 'HK'
}

type HkRankJsonpPayload = {
  code?: number
  msg?: string
  data?: {
    page_data?: string[]
    page_count?: number
    stock_count?: number
  }
}

type HkProxyListPayload = {
  code: number
  msg?: string
  data?: {
    rank_list?: TencentBoardRankRow[]
    total?: number
    offset?: number
  }
}

export function resolveTencentHkBoard(board: string): string {
  const key = board.trim()
  const upper = key.toUpperCase() as TencentHkBoardKey
  if (upper in TENCENT_HK_BOARD_MAP) return TENCENT_HK_BOARD_MAP[upper]
  const lower = key.toLowerCase()
  const values = Object.values(TENCENT_HK_BOARD_MAP)
  if (values.includes(key as typeof values[number])) return key
  if (lower === 'main' || lower === '主板') return TENCENT_HK_BOARD_MAP.MB
  if (lower === 'gem' || lower === '创业板') return TENCENT_HK_BOARD_MAP.GEM
  return TENCENT_HK_BOARD_MAP.MB
}

export function resolveTencentHkSortMetric(sort: string | number): string {
  const idx = Number(sort)
  if (Number.isFinite(idx) && SORT_TO_METRIC[idx]) return SORT_TO_METRIC[idx]!
  const key = String(sort).trim().toLowerCase()
  return METRIC_ALIAS[key] ?? 'change_rate'
}

function resolveProxySortType(sort: string | number): string {
  const metric = resolveTencentHkSortMetric(sort)
  return PROXY_SORT_ALIAS[metric] ?? 'priceRatio'
}

function normalizeHkCode(raw: string): string {
  const text = raw.trim()
  const lower = text.toLowerCase()
  if (lower.startsWith('hk')) return text.slice(2).padStart(5, '0')
  return text.padStart(5, '0')
}

function mapHkPageDataParts(parts: string[]): TencentHkStockRow | null {
  const code = normalizeHkCode(String(parts[0] ?? ''))
  if (!code) return null
  return {
    code,
    name: String(parts[1] ?? code).trim(),
    price: safeFloat(parts[2]),
    changePct: safeFloat(parts[3]),
    changeAmt: safeFloat(parts[4]),
    buy: safeFloat(parts[5]),
    sell: safeFloat(parts[6]),
    volume: safeFloat(parts[7]),
    amount: safeFloat(parts[8]),
    open: safeFloat(parts[9]),
    preClose: safeFloat(parts[10]),
    high: safeFloat(parts[11]),
    low: safeFloat(parts[12]),
    market: 'HK' as const,
  }
}

function mapHkQtParts(parts: string[]): TencentHkStockRow | null {
  const code = normalizeHkCode(String(parts[2] ?? ''))
  if (!code) return null
  return {
    code,
    name: String(parts[1] ?? code).trim(),
    price: safeFloat(parts[3]),
    preClose: safeFloat(parts[4]),
    open: safeFloat(parts[5]),
    buy: safeFloat(parts[9]),
    sell: safeFloat(parts[19]),
    changeAmt: safeFloat(parts[31]),
    changePct: safeFloat(parts[32]),
    volume: safeFloat(parts[36]),
    amount: safeFloat(parts[37]),
    high: safeFloat(parts[33]),
    low: safeFloat(parts[34]),
    market: 'HK' as const,
  }
}

function mapHkPageDataRows(pageData: string[]): TencentHkStockRow[] {
  const rows: TencentHkStockRow[] = []
  for (const line of pageData) {
    const parts = String(line).split('~')
    const row = mapHkPageDataParts(parts)
    if (row) rows.push(row)
  }
  return rows
}

function mapProxyHkRows(rankList: TencentBoardRankRow[]): TencentHkStockRow[] {
  return rankList.map(row => ({
    code: normalizeHkCode(String(row.code ?? '')),
    name: String(row.name ?? '').trim(),
    price: safeFloat(row.zxj),
    preClose: null,
    open: null,
    high: null,
    low: null,
    buy: null,
    sell: null,
    changeAmt: safeFloat(row.zd),
    changePct: safeFloat(row.zdf),
    volume: safeFloat(row.volume),
    amount: safeFloat(row.turnover),
    market: 'HK' as const,
  })).filter(row => row.code)
}

export function mapTencentHkStockRows(rows: TencentHkStockRow[]): Record<string, unknown>[] {
  return rows.map(row => ({
    code: row.code,
    name: row.name,
    price: row.price,
    preClose: row.preClose,
    open: row.open,
    high: row.high,
    low: row.low,
    buy: row.buy,
    sell: row.sell,
    changeAmt: row.changeAmt,
    changePct: row.changePct,
    volume: row.volume,
    amount: row.amount,
    market: row.market,
    source: 'tencent_hk_rank',
  }))
}

async function fetchHkRankJsonp(opts: {
  board: string
  metric: string
  page: number
  pageSize: number
  order: 'asc' | 'desc'
}): Promise<{ rows: TencentHkStockRow[]; total: number } | null> {
  const orderFlag = opts.order === 'asc' ? '1' : '0'
  const qs = new URLSearchParams({
    board: opts.board,
    metric: opts.metric,
    pageSize: String(opts.pageSize),
    reqPage: String(opts.page),
    order: orderFlag,
    var_name: 'list_data',
  })
  const text = await fetchText(`${HK_RANK_URL}?${qs}`, 'utf-8')
  const trimmed = text.trim()
  if (!trimmed) return null

  let payload: HkRankJsonpPayload
  try {
    if (trimmed.startsWith('list_data=')) {
      payload = parseTencentJsonp<HkRankJsonpPayload>(trimmed, 'list_data')
    } else {
      payload = JSON.parse(trimmed) as HkRankJsonpPayload
    }
  } catch {
    return null
  }

  if (payload.code && payload.code !== 0) return null
  const pageData = payload.data?.page_data ?? []
  if (!pageData.length) return null
  const rows = mapHkPageDataRows(pageData)
  const total = payload.data?.stock_count ?? payload.data?.page_count ?? rows.length
  return { rows, total }
}

async function fetchHkRankProxy(opts: {
  board: string
  sortType: string
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}): Promise<{ rows: TencentHkStockRow[]; total: number }> {
  const offset = (opts.page - 1) * opts.pageSize
  const qs = new URLSearchParams({
    board_type: opts.board,
    sort_type: opts.sortType,
    direct: opts.order === 'asc' ? 'up' : 'down',
    offset: String(offset),
    count: String(opts.pageSize),
  })
  const body = await fetchJson<HkProxyListPayload>(`${HK_PROXY_LIST_URL}?${qs}`)
  if (body.code !== 0) {
    throw new Error(body.msg?.trim() || `Tencent HK rank proxy failed (${body.code})`)
  }
  const rankList = body.data?.rank_list ?? []
  return {
    rows: mapProxyHkRows(rankList),
    total: body.data?.total ?? rankList.length,
  }
}

/**
 * 拉取港股排行列表（mstats HK 模块）。
 *
 * 优先 `hk_rank.php` JSONP（与 mstats listTPL.HK 一致），空数据时回退 `rank/hk/getList`。
 *
 * @sourceUrl https://stock.gtimg.cn/data/hk_rank.php?board=main_all&metric=change_rate&...
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=hk_mb&module=hk&type=MB
 */
export async function fetchTencentHkStockList(opts: {
  board?: string
  page?: number
  pageSize?: number
  sortType?: string | number
  order?: 'asc' | 'desc' | 'up' | 'down'
}): Promise<{
  board: string
  boardKey: string
  page: number
  pageSize: number
  total: number
  items: Record<string, unknown>[]
  source: 'tencent_hk_rank' | 'tencent_hk_rank_proxy'
}> {
  const boardKey = opts.board?.trim().toUpperCase() || 'MB'
  const board = resolveTencentHkBoard(boardKey)
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 100))
  const metric = resolveTencentHkSortMetric(opts.sortType ?? 32)
  const orderRaw = opts.order ?? 'desc'
  const order: 'asc' | 'desc' = orderRaw === 'asc' || orderRaw === 'up' ? 'asc' : 'desc'

  const jsonp = await fetchHkRankJsonp({ board, metric, page, pageSize, order }).catch(() => null)
  if (jsonp?.rows.length) {
    return {
      board,
      boardKey,
      page,
      pageSize,
      total: jsonp.total,
      items: mapTencentHkStockRows(jsonp.rows),
      source: 'tencent_hk_rank',
    }
  }

  const proxy = await fetchHkRankProxy({
    board,
    sortType: resolveProxySortType(opts.sortType ?? 32),
    order,
    page,
    pageSize,
  })
  return {
    board,
    boardKey,
    page,
    pageSize,
    total: proxy.total,
    items: mapTencentHkStockRows(proxy.rows),
    source: 'tencent_hk_rank_proxy',
  }
}
