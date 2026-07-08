import { safeFloat } from '../../../utils/helpers.js'
import { fetchJson } from './http.js'
import { TENCENT_PROXY_BASE } from './types.js'
import type { TencentBoardRankRow } from './types.js'

const US_RANK_LIST_URL = `${TENCENT_PROXY_BASE}/cgi/cgi-bin/rank/us/getList`

/**
 * mstats `listTPL.US` — URL `type` → `board_type`。
 *
 * @see https://stockapp.finance.qq.com/mstats/#mod=list&id=us_kjg&module=US&type=tec
 */
export const TENCENT_US_BOARD_MAP = {
  tec: 'tec',
  cdr: 'cdr',
  us_kjg: 'tec',
  us_zgg: 'cdr',
  US_tec: 'tec',
  US_cdr: 'cdr',
  科技股: 'tec',
  中概股: 'cdr',
} as const

export type TencentUsBoardKey = keyof typeof TENCENT_US_BOARD_MAP | 'tec' | 'cdr'

/** mstats 列序号 → `sort_type`（listTPL.US `w` 映射） */
const SORT_TO_FIELD: Record<number, string> = {
  1: 'name',
  2: 'code',
  3: 'price',
  4: 'marketValue',
  5: 'pn',
  9: 'exchange',
  19: 'amplitude',
  31: 'priceChange',
  32: 'priceRatio',
  36: 'volume',
  39: 'peTTM',
}

const SORT_ALIAS: Record<string, string> = {
  name: 'name',
  code: 'code',
  price: 'price',
  zxj: 'price',
  marketvalue: 'marketValue',
  zsz: 'marketValue',
  marketcap: 'marketValue',
  pn: 'pn',
  pb: 'pn',
  exchange: 'exchange',
  hsl: 'exchange',
  turnoverrate: 'exchange',
  amplitude: 'amplitude',
  zf: 'amplitude',
  pricechange: 'priceChange',
  zde: 'priceChange',
  zd: 'priceChange',
  changeratio: 'priceRatio',
  priceRatio: 'priceRatio',
  zdf: 'priceRatio',
  changepct: 'priceRatio',
  volume: 'volume',
  pettm: 'peTTM',
  pe_ttm: 'peTTM',
}

const BOARD_LABEL: Record<'tec' | 'cdr', string> = {
  tec: '美股科技股',
  cdr: '中概股',
}

type UsRankListPayload = {
  code: number
  msg?: string
  data?: {
    rank_list?: TencentBoardRankRow[]
    total?: number
    offset?: number
  }
}

export function resolveTencentUsBoard(board: string): 'tec' | 'cdr' {
  const key = board.trim()
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(TENCENT_US_BOARD_MAP)) {
    if (k.toLowerCase() === lower) return v
  }
  if (lower.includes('tec') || lower.includes('科技') || lower === 'us_kjg') return 'tec'
  if (lower.includes('cdr') || lower.includes('zgg') || lower.includes('中概')) return 'cdr'
  return 'tec'
}

export function resolveTencentUsSortField(sort: string | number): string {
  const idx = Number(sort)
  if (Number.isFinite(idx) && SORT_TO_FIELD[idx]) return SORT_TO_FIELD[idx]!
  const key = String(sort).trim().toLowerCase()
  return SORT_ALIAS[key] ?? 'priceRatio'
}

/** usCTSH.OQ → CTSH；保留原始 qt 代码于 symbol 字段 */
export function bareUsTicker(symbol: string): string {
  const raw = symbol.trim()
  const noPrefix = raw.replace(/^us/i, '')
  const dot = noPrefix.indexOf('.')
  return dot > 0 ? noPrefix.slice(0, dot) : noPrefix
}

export function mapTencentUsStockRows(
  rows: TencentBoardRankRow[],
  board: 'tec' | 'cdr',
): Record<string, unknown>[] {
  return rows.map(row => {
    const symbol = String(row.code ?? '').trim()
    const ticker = bareUsTicker(symbol)
    return {
      code: ticker,
      symbol,
      name: String(row.name ?? ticker),
      price: safeFloat(row.zxj),
      changePct: safeFloat(row.zdf),
      changeAmt: safeFloat(row.zd),
      turnoverRate: safeFloat(row.hsl),
      amplitude: safeFloat(row.zf),
      volume: safeFloat(row.volume),
      turnover: safeFloat(row.turnover),
      peTtm: safeFloat(row.pe_ttm),
      pb: safeFloat(row.pn),
      marketCap: safeFloat(row.zsz),
      floatMarketCap: safeFloat(row.ltsz),
      volumeRatio: safeFloat(row.lb),
      tradeState: row.state ?? '',
      stockType: row.stock_type ?? null,
      board,
      boardLabel: BOARD_LABEL[board],
      market: 'US',
      source: 'tencent_us_rank',
    }
  }).filter(row => row.code || row.symbol)
}

/**
 * 拉取 mstats 美股排行列表（服务端分页）。
 *
 * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/rank/us/getList
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=us_kjg&module=US&type=tec
 */
export async function fetchTencentUsStockList(opts: {
  board?: string
  page?: number
  pageSize?: number
  sortType?: string | number
  order?: 'asc' | 'desc' | 'up' | 'down'
}): Promise<{
  board: 'tec' | 'cdr'
  boardLabel: string
  page: number
  pageSize: number
  total: number
  items: Record<string, unknown>[]
}> {
  const board = resolveTencentUsBoard(opts.board ?? 'tec')
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 100))
  const sortType = resolveTencentUsSortField(opts.sortType ?? 32)
  const orderRaw = opts.order ?? 'desc'
  const direct = orderRaw === 'asc' || orderRaw === 'up' ? 'up' : 'down'
  const offset = (page - 1) * pageSize

  const qs = new URLSearchParams({
    board_type: board,
    sort_type: sortType,
    direct,
    offset: String(offset),
    count: String(pageSize),
  })
  const body = await fetchJson<UsRankListPayload>(`${US_RANK_LIST_URL}?${qs}`)
  if (body.code !== 0) {
    throw new Error(body.msg?.trim() || `Tencent US rank failed (${body.code})`)
  }
  const rankList = body.data?.rank_list ?? []
  return {
    board,
    boardLabel: BOARD_LABEL[board],
    page,
    pageSize,
    total: body.data?.total ?? rankList.length,
    items: mapTencentUsStockRows(rankList, board),
  }
}
