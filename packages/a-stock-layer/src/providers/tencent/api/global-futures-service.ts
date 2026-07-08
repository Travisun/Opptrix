import { safeFloat } from '../../../utils/helpers.js'
import type {
  TencentGlobalFuturesCategoryKey,
  TencentGlobalFuturesRow,
  TencentWorldCommoditiesData,
} from './types.js'
import { fetchTencentWorldCommodities, resolveTencentGlobalFuturesCategory } from './proxy.js'

/**
 * 腾讯 mstats 全球期货 — 客户端品类筛选、排序与分页。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/rank/worldCommodities
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=qh_global&module=GQH&type=ALL
 */
/** mstats `listTPL.GQH` 合并顺序 */
const ALL_CATEGORY_ORDER: Array<keyof TencentWorldCommoditiesData> = [
  'agriculture',
  'basicMetal',
  'energy',
  'exchangeRate',
  'interestRate',
  'preciousMetal',
  'stockIndex',
]

const CATEGORY_LABEL: Record<Exclude<TencentGlobalFuturesCategoryKey, 'ALL'>, string> = {
  agriculture: '农产品',
  basicMetal: '基本金属',
  energy: '能源',
  exchangeRate: '汇率',
  interestRate: '利率',
  preciousMetal: '贵金属',
  stockIndex: '股指期货',
}

type GlobalFuturesSortField = 'name' | 'price' | 'changeAmt' | 'changePct'

const SORT_FIELDS: GlobalFuturesSortField[] = ['name', 'price', 'changeAmt', 'changePct']

function resolveGlobalFuturesSortField(sort: string | number): GlobalFuturesSortField {
  const idx = Number(sort)
  if (Number.isFinite(idx) && idx >= 0 && idx < SORT_FIELDS.length) {
    return SORT_FIELDS[idx]!
  }
  const key = String(sort).trim().toLowerCase()
  if (key === 'zxj' || key === 'price') return 'price'
  if (key === 'zde' || key === 'changeamt' || key === 'change') return 'changeAmt'
  if (key === 'zdf' || key === 'changepct') return 'changePct'
  return 'name'
}

function tradeStateLabel(row: TencentGlobalFuturesRow): string {
  const state = String(row.state ?? row.status ?? '').trim().toLowerCase()
  if (state === 'close') return '闭市'
  if (state === 'open') return '开市'
  if (state === 'break') return '午间休市'
  return state ? state : '--'
}

/** 选取 mstats 品类期货（ALL 按页面顺序合并）。 */
export function pickTencentGlobalFuturesRows(
  data: TencentWorldCommoditiesData,
  category: TencentGlobalFuturesCategoryKey,
): TencentGlobalFuturesRow[] {
  if (category === 'ALL') {
    const merged: TencentGlobalFuturesRow[] = []
    for (const key of ALL_CATEGORY_ORDER) {
      const rows = data[key]
      if (Array.isArray(rows)) merged.push(...rows)
    }
    return merged
  }
  return [...(data[category] ?? [])]
}

export function sortTencentGlobalFuturesRows(
  rows: TencentGlobalFuturesRow[],
  sortType: string | number = 1,
  order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
): TencentGlobalFuturesRow[] {
  const field = resolveGlobalFuturesSortField(sortType)
  const asc = order === 'asc' || order === 'up'
  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (field === 'name') {
      const av = String(a.name ?? '')
      const bv = String(b.name ?? '')
      return asc ? av.localeCompare(bv, 'zh-CN') : bv.localeCompare(av, 'zh-CN')
    }
    const pick = (row: TencentGlobalFuturesRow) => {
      if (field === 'price') return safeFloat(row.zxj) ?? 0
      if (field === 'changeAmt') return safeFloat(row.zde) ?? 0
      return safeFloat(row.zdf) ?? 0
    }
    const av = pick(a)
    const bv = pick(b)
    if (av === bv) return 0
    return asc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
  })
  return sorted
}

export function mapTencentGlobalFuturesRows(
  rows: TencentGlobalFuturesRow[],
  category: TencentGlobalFuturesCategoryKey,
): Record<string, unknown>[] {
  return rows.map(row => ({
    code: String(row.code ?? '').trim(),
    qtCode: String(row.qtcode ?? '').trim(),
    name: String(row.name ?? row.code ?? ''),
    price: safeFloat(row.zxj),
    changeAmt: safeFloat(row.zde),
    changePct: safeFloat(row.zdf),
    exchange: row.location ?? '',
    tradeState: row.state ?? row.status ?? '',
    tradeStateLabel: tradeStateLabel(row),
    category: category === 'ALL' ? null : category,
    categoryLabel: category === 'ALL' ? null : CATEGORY_LABEL[category],
    stockType: row.stocktype ?? '',
    imageUrl: row.img ?? '',
    market: 'global_futures',
    source: 'tencent_world_commodities',
  })).filter(row => row.code || row.qtCode)
}

/**
 * 拉取并分页全球期货列表（供 `tencentGlobalFuturesList` 自定义方法调用）。
 *
 * @param opts.category ALL / energy / preciousMetal 等，支持中文别名
 * @param opts.page 页码，从 1 开始
 * @param opts.pageSize 每页条数，最大 200
 * @param opts.sortType 0 名称 / 1 最新价 / 2 涨跌额 / 3 涨跌幅
 * @param opts.order desc|down 降序，asc|up 升序
 * @returns `{ category, page, pageSize, total, items[] }`
 */
export async function fetchTencentGlobalFuturesList(opts: {
  category?: string
  page?: number
  pageSize?: number
  sortType?: string | number
  order?: 'asc' | 'desc' | 'up' | 'down'
}): Promise<{
  category: TencentGlobalFuturesCategoryKey
  page: number
  pageSize: number
  total: number
  items: Record<string, unknown>[]
}> {
  const category = resolveTencentGlobalFuturesCategory(opts.category ?? 'ALL')
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 40, 200))
  const data = await fetchTencentWorldCommodities()
  const picked = pickTencentGlobalFuturesRows(data, category)
  const sorted = sortTencentGlobalFuturesRows(picked, opts.sortType ?? 1, opts.order ?? 'desc')
  const total = sorted.length
  const start = (page - 1) * pageSize
  const slice = sorted.slice(start, start + pageSize)
  return {
    category,
    page,
    pageSize,
    total,
    items: mapTencentGlobalFuturesRows(slice, category),
  }
}
