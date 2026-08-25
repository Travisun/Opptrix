/**
 * OpptrixQuant API 客户端函数 — https://quant.opptrix.net/api/v1
 *
 * 认证走 `StockIndexHttpClient`（X-API-Key）；未配置 Key 时返回 null。
 * 分页约定：单页 ≤ 35（page/page_size/total_pages/has_more），跨页由本层循环。
 */
import type { Market } from '@opptrix/shared'
import { sleep } from '../../../utils/http-shared.js'
import { opptrixInstrumentToStockIndexItem } from '../normalize.js'
import { StockIndexHttpClient } from './http-client.js'

/** OpptrixQuant 单页上限 */
const OPPTRIX_PAGE_SIZE_CAP = 35
/** 防失控的硬性分页上限 */
const OPPTRIX_MAX_PAGES = 500

export interface OpptrixPagination {
  page: number
  page_size: number
  total: number
  total_pages: number
  has_more: boolean
}

/** GET /api/v1/instruments 返回的标的 */
export interface OpptrixInstrument {
  instrument_id: string
  market: string
  class_token: string
  symbol: string
  name?: string | null
  name_en?: string | null
  venue?: string | null
  sub_type?: string | null
  isin?: string | null
  currency?: string | null
  status?: string | null
}

/** GET /api/v1/funds/{code}/nav 返回的净值行 */
export interface OpptrixNavRow {
  product_code: string
  as_of_date: string
  nav_unit?: string | null
  nav_cumulative?: string | null
  fund_assets?: string | null
  per_10k_gain?: string | null
  annualized_7d?: string | null
  remarks?: string | null
}

/** POST /api/v1/funds/nav/latest 返回的批量最新净值项 */
export interface OpptrixFundLatestNavItem {
  id: string
  product_code: string | null
  product_name: string | null
  as_of_date: string | null
  nav_unit: number | string | null
  nav_cumulative: number | string | null
  fund_assets: number | string | null
  per_10k_gain: number | string | null
  annualized_7d: number | string | null
  remarks: string | null
}

/** GET /api/v1/funds/{code}/metrics 返回的绩效指标 */
export interface OpptrixFundMetrics {
  as_of_date?: string | null
  start_date?: string | null
  end_date?: string | null
  total_return?: string | null
  annual_return?: string | null
  win_rate?: string | null
  max_drawdown?: string | null
  annual_vol?: string | null
  downside_vol?: string | null
  sharpe?: string | null
  sortino?: string | null
  calmar?: string | null
  days?: number | null
  product_code?: string | null
  product_name?: string | null
}

/** 旧 StockIndex 行形态 — normalize / market-data 兼容层（新旧字段共存） */
export interface StockIndexItem {
  instrumentId: string
  market: string
  code: string
  symbol?: string
  nameCn?: string | null
  industryCode?: string | null
  industryName?: string | null
  sub_type?: string | null
  exchange?: string | null
  board?: string | null
  boards?: string[]
  assetType?: string
  matchField?: string
  score?: number
}

export interface StockIndexListResponse {
  page?: number
  pageSize?: number
  total?: number
  items: StockIndexItem[]
}

interface OpptrixPage<T> {
  data?: T[]
  pagination?: OpptrixPagination
}

function clientOrNull(): StockIndexHttpClient | null {
  return StockIndexHttpClient.fromConfig()
}

/**
 * 标的搜索 / 列表 — GET /api/v1/instruments（q / market / class_token）。
 * 内部按 has_more 翻页直到 limit 或上游 total。
 */
export async function opptrixInstrumentSearch(
  q: string,
  opts: {
    market?: string
    classToken?: string
    limit?: number
    /** 跨页间隔 ms — 批量名录同步时缓解日/月配额 */
    delayMs?: number
  } = {},
): Promise<OpptrixInstrument[] | null> {
  const client = clientOrNull()
  if (!client) return null
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 5000)
  const pageSize = Math.min(OPPTRIX_PAGE_SIZE_CAP, limit)
  const all: OpptrixInstrument[] = []
  let page = 1
  for (;;) {
    const resp = await client.get<OpptrixPage<OpptrixInstrument>>('/api/v1/instruments', {
      q: q.trim() || undefined,
      market: opts.market,
      class_token: opts.classToken,
      page: String(page),
      page_size: String(pageSize),
    })
    const batch = resp?.data ?? []
    all.push(...batch)
    const pagination = resp?.pagination
    if (!batch.length) break
    if (!pagination?.has_more) break
    if (pagination && pagination.total > 0 && all.length >= pagination.total) break
    if (all.length >= limit) break
    if (page >= OPPTRIX_MAX_PAGES) break
    page += 1
    if (opts.delayMs && opts.delayMs > 0) await sleep(opts.delayMs)
  }
  return all.slice(0, limit)
}

/** 标的详情 — GET /api/v1/instruments/{id}（id 形如 CN:of:009049） */
export async function opptrixGetInstrument(id: string): Promise<OpptrixInstrument | null> {
  const client = clientOrNull()
  if (!client) return null
  const resp = await client.get<OpptrixInstrument>(
    `/api/v1/instruments/${encodeURIComponent(id)}`,
  )
  return resp ?? null
}

/** 单基金净值历史 — GET /api/v1/funds/{code}/nav（has_more 翻页到 limit） */
export async function opptrixFundNav(
  code: string,
  opts: { start?: string; end?: string; limit?: number; delayMs?: number } = {},
): Promise<OpptrixNavRow[] | null> {
  const client = clientOrNull()
  if (!client) return null
  const limit = Math.min(Math.max(opts.limit ?? 120, 1), 5000)
  const pageSize = Math.min(OPPTRIX_PAGE_SIZE_CAP, limit)
  const all: OpptrixNavRow[] = []
  let page = 1
  for (;;) {
    const resp = await client.get<OpptrixPage<OpptrixNavRow>>(
      `/api/v1/funds/${encodeURIComponent(code)}/nav`,
      {
        start: opts.start,
        end: opts.end,
        page: String(page),
        page_size: String(pageSize),
      },
    )
    const batch = resp?.data ?? []
    all.push(...batch)
    const pagination = resp?.pagination
    if (!batch.length) break
    if (!pagination?.has_more) break
    if (pagination && pagination.total > 0 && all.length >= pagination.total) break
    if (all.length >= limit) break
    if (page >= OPPTRIX_MAX_PAGES) break
    page += 1
    if (opts.delayMs && opts.delayMs > 0) await sleep(opts.delayMs)
  }
  return all.slice(0, limit)
}

/** 批量最新净值 — POST /api/v1/funds/nav/latest（items 形式，每块 ≤ 10） */
export async function opptrixFundQuoteBatch(
  codes: string[],
): Promise<OpptrixFundLatestNavItem[] | null> {
  const client = clientOrNull()
  if (!client) return null
  const unique = [...new Set(codes.map(c => String(c).trim()).filter(Boolean))]
  if (!unique.length) return []
  const out: OpptrixFundLatestNavItem[] = []
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10)
    const resp = await client.post<{ data?: OpptrixFundLatestNavItem[] }>(
      '/api/v1/funds/nav/latest',
      { items: chunk.map(code => ({ id: code, code })) },
    )
    out.push(...(resp?.data ?? []))
  }
  return out
}

/** 基金绩效指标 — GET /api/v1/funds/{code}/metrics */
export async function opptrixFundMetrics(code: string): Promise<OpptrixFundMetrics | null> {
  const client = clientOrNull()
  if (!client) return null
  const resp = await client.get<OpptrixFundMetrics>(
    `/api/v1/funds/${encodeURIComponent(code)}/metrics`,
  )
  return resp ?? null
}

export interface StockIndexListStocksOpts {
  market?: Market | string
  page?: number
  pageSize?: number
  q?: string
}

/** 个股名录（供 market-data sync）— 改走 /api/v1/instruments?class_token=stock */
export async function stockIndexListStocks(
  opts: StockIndexListStocksOpts = {},
): Promise<StockIndexListResponse> {
  const client = clientOrNull()
  if (!client) return { items: [] }
  const pageSize = Math.min(
    OPPTRIX_PAGE_SIZE_CAP,
    Math.max(opts.pageSize ?? OPPTRIX_PAGE_SIZE_CAP, 1),
  )
  const resp = await client.get<OpptrixPage<OpptrixInstrument>>('/api/v1/instruments', {
    market: String(opts.market ?? 'CN'),
    class_token: 'stock',
    q: opts.q?.trim() || undefined,
    page: String(opts.page ?? 1),
    page_size: String(pageSize),
  })
  const items = (resp?.data ?? []).map(opptrixInstrumentToStockIndexItem)
  return {
    page: opts.page ?? 1,
    pageSize,
    total: resp?.pagination?.total ?? items.length,
    items,
  }
}

/** CN ETF 名录（供 market-data sync）— 改走 /api/v1/instruments?class_token=etf */
export async function stockIndexListEtfs(
  opts: { page?: number; pageSize?: number; q?: string } = {},
): Promise<StockIndexListResponse> {
  const client = clientOrNull()
  if (!client) return { items: [] }
  const pageSize = Math.min(
    OPPTRIX_PAGE_SIZE_CAP,
    Math.max(opts.pageSize ?? OPPTRIX_PAGE_SIZE_CAP, 1),
  )
  const resp = await client.get<OpptrixPage<OpptrixInstrument>>('/api/v1/instruments', {
    market: 'CN',
    class_token: 'etf',
    q: opts.q?.trim() || undefined,
    page: String(opts.page ?? 1),
    page_size: String(pageSize),
  })
  const items = (resp?.data ?? []).map(opptrixInstrumentToStockIndexItem)
  return {
    page: opts.page ?? 1,
    pageSize,
    total: resp?.pagination?.total ?? items.length,
    items,
  }
}


/** 测试 Opptrix量化 连接 — 用数据密钥发起一次轻量标的搜索 */
export async function testStockIndexConnection(
  apiKey?: string,
): Promise<{ ok: boolean; message: string }> {
  const key = (apiKey ?? '').trim()
  if (!key) {
    return { ok: false, message: '请先填写数据密钥' }
  }
  // 临时写入进程环境，供 HttpClient.fromConfig 读取（不落库、不打日志）
  const prev = process.env.OPPTRIX_STOCKINDEX_API_KEY
  process.env.OPPTRIX_STOCKINDEX_API_KEY = key
  try {
    const hits = await opptrixInstrumentSearch('AAPL', { market: 'US', limit: 1 })
    if (hits == null) {
      return { ok: false, message: '暂时无法连接 Opptrix量化，请检查数据密钥后重试' }
    }
    return { ok: true, message: 'Opptrix量化 连接成功' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg || '连接失败，请稍后重试' }
  } finally {
    if (prev === undefined) delete process.env.OPPTRIX_STOCKINDEX_API_KEY
    else process.env.OPPTRIX_STOCKINDEX_API_KEY = prev
  }
}
