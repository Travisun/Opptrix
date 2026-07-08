import { safeFloat } from '../../../utils/helpers.js'
import { fetchText } from './http.js'
import { parseTencentLine } from '../normalize/quote.js'

const WH_FOREX_URL = 'https://qt.gtimg.cn/?q='

/** mstats `listTPL.ER` — 基本汇率（对美元/人民币等直盘） */
export const TENCENT_FOREX_BASE_SYMBOLS = [
  'whXAUUSD', 'whXAGUSD', 'whEURUSD', 'whGBPUSD', 'whUSDCHF', 'whUSDCAD',
  'whUSDJPY', 'whUSDHKD', 'whAUDUSD', 'whSGDUSD', 'whUSDSEK', 'whUSDCNY', 'whNZDUSD',
] as const

/** mstats `listTPL.ER` — 交叉汇率 */
export const TENCENT_FOREX_CROSS_SYMBOLS = [
  'whEURJPY', 'whCHFJPY', 'whNZDCHF', 'whNZDHKD', 'whNZDJPY', 'whAUDHKD', 'whAUDJPY',
  'whXAUGBP', 'whEURHKD', 'whCASF', 'whAUDEUR', 'whEURCHF', 'whHKDCNY', 'whAUDCHF',
  'whGBPJPY', 'whGBPCHF', 'whXAUEUR', 'whEURNZD', 'whCADJPY', 'whGBPHKD', 'whEURCAD',
  'whGBPAUD', 'whAUDCAD', 'whCHFHKD', 'whNZDAUD', 'whGBPCAD', 'whCADHKD', 'whGBPEUR',
  'whXAGEUR', 'whEURGBP', 'whAUDNZD', 'whHKDJPY', 'whXAGGBP', 'whCHFCAD', 'whNZDEUR',
  'whNZDCAD', 'whEURAUD', 'whXAUAUD',
] as const

export type TencentExchangeRateCategoryKey = 'ALL' | 'BASE' | 'CROSS'

export type TencentWhForexRow = {
  symbol: string
  pair: string
  name: string
  price: number | null
  preClose: number | null
  open: number | null
  high: number | null
  low: number | null
  bid: number | null
  ask: number | null
  changeAmt: number | null
  changePct: number | null
  quoteTime: string
  category: 'BASE' | 'CROSS'
}

type ExchangeRateSortField =
  | 'name' | 'pair' | 'price' | 'changeAmt' | 'changePct'
  | 'high' | 'low' | 'preClose' | 'open' | 'bid' | 'ask' | 'quoteTime'

const SORT_FIELDS: ExchangeRateSortField[] = [
  'name', 'pair', 'price', 'changePct', 'changeAmt',
  'high', 'low', 'preClose', 'open', 'bid', 'ask', 'quoteTime',
]

const CATEGORY_LABEL: Record<Exclude<TencentExchangeRateCategoryKey, 'ALL'>, string> = {
  BASE: '基本汇率',
  CROSS: '交叉汇率',
}

/**
 * mstats ER 分区 → `type` 参数（ALL / BASE / CROSS）。
 */
export function resolveTencentExchangeRateCategory(category: string): TencentExchangeRateCategoryKey {
  const key = category.trim().toUpperCase()
  if (key === 'BASE' || key === '基本' || key === '基本汇率') return 'BASE'
  if (key === 'CROSS' || key === '交叉' || key === '交叉汇率') return 'CROSS'
  return 'ALL'
}

/** 用户 pair（USDCNY / EURUSD）→ `wh` 行情代码 */
export function resolveTencentForexSymbol(pair: string): string | null {
  const raw = pair.trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (!raw) return null
  const symbol = `wh${raw}`
  const all = [...TENCENT_FOREX_BASE_SYMBOLS, ...TENCENT_FOREX_CROSS_SYMBOLS]
  return all.includes(symbol as typeof all[number]) ? symbol : null
}

export function pickTencentForexSymbols(category: TencentExchangeRateCategoryKey): string[] {
  if (category === 'BASE') return [...TENCENT_FOREX_BASE_SYMBOLS]
  if (category === 'CROSS') return [...TENCENT_FOREX_CROSS_SYMBOLS]
  return [...TENCENT_FOREX_BASE_SYMBOLS, ...TENCENT_FOREX_CROSS_SYMBOLS]
}

function resolveCategoryForSymbol(symbol: string): Exclude<TencentExchangeRateCategoryKey, 'ALL'> {
  return TENCENT_FOREX_BASE_SYMBOLS.includes(symbol as typeof TENCENT_FOREX_BASE_SYMBOLS[number])
    ? 'BASE'
    : 'CROSS'
}

function formatQuoteTime(raw: string): string {
  const s = raw.trim()
  if (s.length >= 12) {
    return `${s.slice(8, 10)}:${s.slice(10, 12)}`
  }
  return s || '--'
}

function mapWhForexParts(symbol: string, parts: string[]): TencentWhForexRow | null {
  const price = safeFloat(parts[3])
  const preClose = safeFloat(parts[6])
  if (price == null && preClose == null) return null
  const changeAmt = price != null && preClose != null
    ? Number((price - preClose).toFixed(4))
    : safeFloat(parts[12])
  const changePct = changeAmt != null && preClose
    ? Number(((changeAmt * 100) / preClose).toFixed(2))
    : safeFloat(parts[13])
  return {
    symbol,
    pair: String(parts[2] ?? symbol.replace(/^wh/i, '')).trim(),
    name: String(parts[1] ?? parts[2] ?? symbol).trim(),
    price,
    preClose,
    open: safeFloat(parts[7]),
    high: safeFloat(parts[8]),
    low: safeFloat(parts[9]),
    bid: safeFloat(parts[10]),
    ask: safeFloat(parts[11]),
    changeAmt,
    changePct,
    quoteTime: formatQuoteTime(String(parts[5] ?? '')),
    category: resolveCategoryForSymbol(symbol),
  }
}

function resolveExchangeRateSortField(sort: string | number): ExchangeRateSortField {
  const idx = Number(sort)
  if (Number.isFinite(idx) && idx >= 0 && idx < SORT_FIELDS.length) {
    return SORT_FIELDS[idx]!
  }
  const key = String(sort).trim().toLowerCase()
  const alias: Record<string, ExchangeRateSortField> = {
    zxj: 'price',
    zde: 'changeAmt',
    zdf: 'changePct',
    changepct: 'changePct',
    changeamt: 'changeAmt',
    code: 'pair',
    pair: 'pair',
    time: 'quoteTime',
  }
  return alias[key] ?? 'changePct'
}

/**
 * 拉取 mstats 全球外汇 `wh*` 实时行情。
 *
 * @sourceUrl https://qt.gtimg.cn/?q=whUSDCNY,whEURUSD,...
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=exchange&module=ER&type=ALL
 */
export async function fetchTencentWhForexQuotes(symbols: string[]): Promise<TencentWhForexRow[]> {
  if (!symbols.length) return []
  const text = await fetchText(`${WH_FOREX_URL}${symbols.join(',')}`, 'gbk')
  const lines = text.trim().split('\n').filter(Boolean)
  const rows: TencentWhForexRow[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const parts = parseTencentLine(lines[i]!)
    if (!parts) continue
    const symbol = symbols[i] ?? parts[2] ?? ''
    const row = mapWhForexParts(String(symbol).trim(), parts)
    if (row) rows.push(row)
  }
  return rows
}

export function sortTencentExchangeRateRows(
  rows: TencentWhForexRow[],
  sortType: string | number = 3,
  order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
): TencentWhForexRow[] {
  const field = resolveExchangeRateSortField(sortType)
  const asc = order === 'asc' || order === 'up'
  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (field === 'name' || field === 'pair' || field === 'quoteTime') {
      const av = String(field === 'pair' ? a.pair : field === 'name' ? a.name : a.quoteTime)
      const bv = String(field === 'pair' ? b.pair : field === 'name' ? b.name : b.quoteTime)
      return asc ? av.localeCompare(bv, 'zh-CN') : bv.localeCompare(av, 'zh-CN')
    }
    const pick = (row: TencentWhForexRow) => {
      if (field === 'price') return row.price ?? 0
      if (field === 'changeAmt') return row.changeAmt ?? 0
      if (field === 'high') return row.high ?? 0
      if (field === 'low') return row.low ?? 0
      if (field === 'preClose') return row.preClose ?? 0
      if (field === 'open') return row.open ?? 0
      if (field === 'bid') return row.bid ?? 0
      if (field === 'ask') return row.ask ?? 0
      return row.changePct ?? 0
    }
    const av = pick(a)
    const bv = pick(b)
    if (av === bv) return 0
    return asc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
  })
  return sorted
}

export function mapTencentExchangeRateRows(
  rows: TencentWhForexRow[],
  category: TencentExchangeRateCategoryKey,
): Record<string, unknown>[] {
  return rows.map(row => ({
    code: row.pair,
    qtCode: row.symbol,
    name: row.name,
    price: row.price,
    changeAmt: row.changeAmt,
    changePct: row.changePct,
    preClose: row.preClose,
    open: row.open,
    high: row.high,
    low: row.low,
    bid: row.bid,
    ask: row.ask,
    quoteTime: row.quoteTime,
    category: category === 'ALL' ? row.category : category,
    categoryLabel: category === 'ALL'
      ? CATEGORY_LABEL[row.category]
      : CATEGORY_LABEL[category as 'BASE' | 'CROSS'],
    market: 'forex',
    source: 'tencent_wh_forex',
  }))
}

/**
 * 拉取并分页全球外汇列表（供 `tencentExchangeRateList` 与 `exchangeRate` capability 调用）。
 *
 * @param opts.category ALL / BASE / CROSS
 * @param opts.pair 可选，指定货币对如 USDCNY（优先于 category 列表）
 */
export async function fetchTencentExchangeRateList(opts: {
  category?: string
  pair?: string
  page?: number
  pageSize?: number
  sortType?: string | number
  order?: 'asc' | 'desc' | 'up' | 'down'
}): Promise<{
  category: TencentExchangeRateCategoryKey
  page: number
  pageSize: number
  total: number
  items: Record<string, unknown>[]
}> {
  const category = resolveTencentExchangeRateCategory(opts.category ?? 'ALL')
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 40, 200))

  let symbols = pickTencentForexSymbols(category)
  const pair = opts.pair?.trim()
  if (pair) {
    const sym = resolveTencentForexSymbol(pair)
    if (sym) symbols = [sym]
  }

  const rows = await fetchTencentWhForexQuotes(symbols)
  const sorted = sortTencentExchangeRateRows(rows, opts.sortType ?? 3, opts.order ?? 'desc')
  const total = sorted.length
  const start = (page - 1) * pageSize
  const slice = sorted.slice(start, start + pageSize)
  return {
    category: pair && symbols[0] ? resolveCategoryForSymbol(symbols[0]) : category,
    page,
    pageSize,
    total,
    items: mapTencentExchangeRateRows(slice, category),
  }
}
