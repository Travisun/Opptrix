import { fetchTencentBoardRankList } from './proxy.js'
import { TENCENT_BOARD_CODE_MAP } from './types.js'
import type { TencentBoardSortField } from './types.js'
import { mapTencentIndustryConstituentRows } from '../normalize/market.js'

/**
 * mstats `listTPL.HS` — URL `type` → `getBoardRankList` 的 `board_code`。
 *
 * @see https://stockapp.finance.qq.com/mstats/#mod=list&id=hs_hsj&module=hs&type=hsj
 */
export const TENCENT_CN_BOARD_MAP = {
  hsj: 'aStock',
  hs_hsj: 'aStock',
  HSJ: 'aStock',
  astock: 'aStock',
  aStock: 'aStock',
  沪深京: 'aStock',
  cyb: 'cyb',
  hs_cyb: 'cyb',
  CYB: 'cyb',
  gem: 'cyb',
  创业板: 'cyb',
  kcb: 'ksh',
  hs_kcb: 'ksh',
  KCB: 'ksh',
  ksh: 'ksh',
  star: 'ksh',
  科创板: 'ksh',
} as const

export type TencentCnBoardKey = keyof typeof TENCENT_CN_BOARD_MAP | 'hsj' | 'cyb' | 'kcb'

const BOARD_LABEL: Record<string, string> = {
  aStock: '沪深京A股',
  cyb: '创业板',
  ksh: '科创板',
}

const MSTATS_LIST_ID: Record<string, string> = {
  aStock: 'hs_hsj',
  cyb: 'hs_cyb',
  ksh: 'hs_kcb',
}

/** mstats 列序号 → `sort_type`（与 listTPL.HS / 行业成分页一致） */
const SORT_TO_FIELD: Record<number, TencentBoardSortField> = {
  1: 'name',
  2: 'code',
  3: 'price',
  4: 'netMainIn',
  5: 'volumeRatio',
  9: 'exchange',
  19: 'amplitude',
  31: 'priceChange',
  32: 'priceRatio',
  36: 'volume',
  37: 'turnover',
}

const SORT_ALIAS: Record<string, TencentBoardSortField> = {
  name: 'name',
  code: 'code',
  price: 'price',
  zxj: 'price',
  pricechange: 'priceChange',
  zde: 'priceChange',
  zd: 'priceChange',
  changeratio: 'priceRatio',
  priceRatio: 'priceRatio',
  zdf: 'priceRatio',
  changepct: 'priceRatio',
  exchange: 'exchange',
  hsl: 'exchange',
  turnoverrate: 'exchange',
  netmainin: 'netMainIn',
  zljlr: 'netMainIn',
  volumeratio: 'volumeRatio',
  lb: 'volumeRatio',
  amplitude: 'amplitude',
  zf: 'amplitude',
  volume: 'volume',
  turnover: 'turnover',
}

export function resolveTencentCnBoard(board: string): 'aStock' | 'cyb' | 'ksh' {
  const key = board.trim()
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(TENCENT_CN_BOARD_MAP)) {
    if (k.toLowerCase() === lower) return v as 'aStock' | 'cyb' | 'ksh'
  }
  const mapped = TENCENT_BOARD_CODE_MAP[lower]
  if (mapped === 'aStock' || mapped === 'cyb' || mapped === 'ksh') return mapped
  if (lower.includes('cyb') || lower.includes('创业')) return 'cyb'
  if (lower.includes('kcb') || lower.includes('ksh') || lower.includes('科创')) return 'ksh'
  return 'aStock'
}

export function resolveTencentCnSortField(sort: string | number): TencentBoardSortField {
  const idx = Number(sort)
  if (Number.isFinite(idx) && SORT_TO_FIELD[idx]) return SORT_TO_FIELD[idx]!
  const key = String(sort).trim().toLowerCase()
  return SORT_ALIAS[key] ?? 'priceRatio'
}

/**
 * 拉取 mstats 沪深 A 股排行列表（服务端分页）。
 *
 * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=hs_hsj&module=hs&type=hsj
 */
export async function fetchTencentCnStockList(opts: {
  board?: string
  page?: number
  pageSize?: number
  sortType?: string | number
  order?: 'asc' | 'desc' | 'up' | 'down'
}): Promise<{
  board: 'aStock' | 'cyb' | 'ksh'
  boardKey: string
  boardLabel: string
  mstatsListId: string
  page: number
  pageSize: number
  total: number
  items: Record<string, unknown>[]
}> {
  const board = resolveTencentCnBoard(opts.board ?? 'hsj')
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 100))
  const sortType = resolveTencentCnSortField(opts.sortType ?? 32)
  const orderRaw = opts.order ?? 'desc'
  const direct = orderRaw === 'asc' || orderRaw === 'up' ? 'up' : 'down'
  const offset = (page - 1) * pageSize

  const data = await fetchTencentBoardRankList({
    boardCode: board,
    sortType,
    direct,
    offset,
    count: pageSize,
  })
  const rankList = data.rank_list ?? []
  const items = mapTencentIndustryConstituentRows(rankList).map(row => ({
    ...row,
    source: 'tencent_cn_rank',
  }))

  return {
    board,
    boardKey: opts.board?.trim() || board,
    boardLabel: BOARD_LABEL[board] ?? board,
    mstatsListId: MSTATS_LIST_ID[board] ?? board,
    page,
    pageSize,
    total: data.total ?? rankList.length,
    items,
  }
}
