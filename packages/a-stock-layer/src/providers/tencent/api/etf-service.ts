import { normalizeCode } from '../../../utils/helpers.js'
import { filterCnEtfListItems } from '../../common/standard-etf.js'
import type { StockListItem } from '../../../core/schema.js'
import { fetchTencentBoardRankList } from './proxy.js'
import { mapTencentBoardRankRows } from '../normalize/content.js'

/** 沪深京 A 股板块排行全量拉取（用于筛 ETF） */
export async function fetchTencentAStockListAll(maxItems = 6000): Promise<StockListItem[]> {
  const all: StockListItem[] = []
  const pageSize = 100
  let offset = 0

  for (;;) {
    const data = await fetchTencentBoardRankList({
      boardCode: 'aStock',
      offset,
      count: pageSize,
    })
    const batch = mapTencentBoardRankRows(data.rank_list ?? [])
    if (!batch.length) break
    all.push(...batch)
    if (all.length >= maxItems || batch.length < pageSize) break
    offset += pageSize
  }

  return all.slice(0, maxItems)
}

/** ETF 列表 — 从 aStock 排行筛代码段 + 带来源标记 */
export async function fetchTencentEtfListItems(): Promise<StockListItem[]> {
  const all = await fetchTencentAStockListAll()
  return filterCnEtfListItems(all).map(item => ({
    ...item,
    industry: item.industry || 'ETF',
  }))
}

/** 单只 ETF 基础信息（profile / 行情兜底） */
export async function fetchTencentEtfBasicItem(code: string): Promise<StockListItem | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  return {
    code: bare,
    name: bare,
    industry: 'ETF',
    market: bare.startsWith('6') ? 'SH' : 'SZ',
  }
}
