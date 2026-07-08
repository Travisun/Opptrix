import { safeFloat } from '../../../utils/helpers.js'
import type {
  TencentGlobalIndexRankData,
  TencentGlobalIndexRankRow,
  TencentGlobalIndexRegionKey,
} from './types.js'
import { fetchTencentGlobalIndexRankDetail, resolveTencentGlobalIndexRegion } from './proxy.js'

/**
 * 腾讯 mstats 全球股指 — 客户端分区筛选、排序与分页。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/rank/indexRankDetail2
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=indices&module=GIDX&type=ALL
 */
const REGION_BUCKET: Record<TencentGlobalIndexRegionKey, keyof TencentGlobalIndexRankData | 'all'> = {
  ALL: 'all',
  EU: 'europe',
  AM: 'america',
  AS: 'asia',
  OA: 'other',
  AF: 'other',
}

type GlobalIndexSortField = 'name' | 'price' | 'changePct'

const SORT_FIELDS: GlobalIndexSortField[] = ['name', 'price', 'changePct']

function resolveGlobalIndexSortField(sort: string | number): GlobalIndexSortField {
  const idx = Number(sort)
  if (Number.isFinite(idx) && idx >= 0 && idx < SORT_FIELDS.length) {
    return SORT_FIELDS[idx]!
  }
  const key = String(sort).trim().toLowerCase()
  if (key === 'zxj' || key === 'price') return 'price'
  if (key === 'zdf' || key === 'changeratio' || key === 'changepct') return 'changePct'
  return 'name'
}

function tradeStateLabel(state: unknown): string {
  const key = String(state ?? '').trim().toLowerCase()
  if (key === 'close') return '闭市'
  if (key === 'open') return '开市'
  if (key === 'break') return '午间休市'
  return key ? key : '--'
}

/** 选取 mstats 分区指数（ALL 合并去重）。 */
export function pickTencentGlobalIndexRows(
  data: TencentGlobalIndexRankData,
  region: TencentGlobalIndexRegionKey,
): TencentGlobalIndexRankRow[] {
  const bucket = REGION_BUCKET[region]
  if (bucket === 'all') {
    const seen = new Set<string>()
    const merged: TencentGlobalIndexRankRow[] = []
    for (const rows of Object.values(data)) {
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const key = String(row.qtcode ?? row.code ?? '').trim()
        if (!key || seen.has(key)) continue
        seen.add(key)
        merged.push(row)
      }
    }
    return merged
  }
  return [...(data[bucket] ?? [])]
}

export function sortTencentGlobalIndexRows(
  rows: TencentGlobalIndexRankRow[],
  sortType: string | number = 'price',
  order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
): TencentGlobalIndexRankRow[] {
  const field = resolveGlobalIndexSortField(sortType)
  const asc = order === 'asc' || order === 'up'
  const sorted = [...rows]
  sorted.sort((a, b) => {
    let av: string | number
    let bv: string | number
    if (field === 'name') {
      av = String(a.name ?? '')
      bv = String(b.name ?? '')
      return asc ? av.localeCompare(bv, 'zh-CN') : bv.localeCompare(av, 'zh-CN')
    }
    av = field === 'price' ? (safeFloat(a.zxj) ?? 0) : (safeFloat(a.zdf) ?? 0)
    bv = field === 'price' ? (safeFloat(b.zxj) ?? 0) : (safeFloat(b.zdf) ?? 0)
    if (av === bv) return 0
    return asc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
  })
  return sorted
}

export function mapTencentGlobalIndexRankRows(
  rows: TencentGlobalIndexRankRow[],
  region: TencentGlobalIndexRegionKey,
): Record<string, unknown>[] {
  return rows.map(row => ({
    code: String(row.code ?? '').trim(),
    qtCode: String(row.qtcode ?? '').trim(),
    name: String(row.name ?? row.code ?? ''),
    location: row.location ?? '',
    price: safeFloat(row.zxj),
    changePct: safeFloat(row.zdf),
    tradeState: row.state ?? '',
    tradeStateLabel: tradeStateLabel(row.state),
    imageUrl: row.img ?? '',
    region,
    market: 'global',
    source: 'tencent_global_index_rank',
  })).filter(row => row.code || row.qtCode)
}

/**
 * 拉取并分页全球股指列表（供 `tencentGlobalIndexList` 自定义方法调用）。
 *
 * @param opts.region ALL / EU / AM / AS / OA
 * @param opts.page 页码，从 1 开始
 * @param opts.pageSize 每页条数，最大 200
 * @param opts.sortType 0 名称 / 1 最新价 / 2 涨跌幅
 * @param opts.order desc|down 降序，asc|up 升序
 * @returns `{ region, page, pageSize, total, items[] }`
 */
export async function fetchTencentGlobalIndexList(opts: {
  region?: string
  page?: number
  pageSize?: number
  sortType?: string | number
  order?: 'asc' | 'desc' | 'up' | 'down'
}): Promise<{
  region: TencentGlobalIndexRegionKey
  page: number
  pageSize: number
  total: number
  items: Record<string, unknown>[]
}> {
  const region = resolveTencentGlobalIndexRegion(opts.region ?? 'ALL')
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 40, 200))
  const data = await fetchTencentGlobalIndexRankDetail()
  const picked = pickTencentGlobalIndexRows(data, region)
  const sorted = sortTencentGlobalIndexRows(picked, opts.sortType ?? 1, opts.order ?? 'desc')
  const total = sorted.length
  const start = (page - 1) * pageSize
  const slice = sorted.slice(start, start + pageSize)
  return {
    region,
    page,
    pageSize,
    total,
    items: mapTencentGlobalIndexRankRows(slice, region),
  }
}
