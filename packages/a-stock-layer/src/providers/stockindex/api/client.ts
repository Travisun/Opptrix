/**
 * StockIndex HTTP 客户端 — https://open-stock.lirdb.com
 */

import type { Market } from '@opptrix/shared'
import { sleep } from '../../../utils/http-shared.js'
import { stockIndexBaseUrl } from '../settings.js'

const STOCKINDEX_FETCH_TIMEOUT_MS = 30_000
const STOCKINDEX_FETCH_RETRIES = 3

export interface StockIndexItem {
  instrumentId: string
  market: string
  code: string
  symbol?: string
  nameCn?: string | null
  industryCode?: string | null
  industryName?: string | null
  exchange?: string | null
  board?: string | null
  boards?: string[]
  assetType?: string
  matchField?: string
  score?: number
}

export interface StockIndexSearchResponse {
  query: string
  total: number
  items: StockIndexItem[]
}

export interface StockIndexListResponse {
  page?: number
  pageSize?: number
  total?: number
  items: StockIndexItem[]
}

export interface StockIndexBoard {
  market?: string
  boardKey?: string
  boardCode?: string
  name?: string
  priority?: number
  stockCount?: number
}

export interface StockIndexBoardListResponse {
  total?: number
  items: StockIndexBoard[]
}

export interface StockIndexIndustry {
  market?: string
  industryCode?: string
  name?: string
  level?: number
  parentCode?: string | null
  stockCount?: number
  parentName?: string | null
}

export interface StockIndexIndustryListResponse {
  total?: number
  items: StockIndexIndustry[]
}

async function fetchJson<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === '') continue
    qs.set(k, String(v))
  }
  const url = `${stockIndexBaseUrl()}${path}?${qs}`
  let lastErr: unknown
  for (let attempt = 0; attempt < STOCKINDEX_FETCH_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(STOCKINDEX_FETCH_TIMEOUT_MS),
      })
      if (!resp.ok) {
        throw new Error(`StockIndex HTTP ${resp.status} ${path}`)
      }
      return await resp.json() as T
    } catch (e) {
      lastErr = e
      if (attempt < STOCKINDEX_FETCH_RETRIES - 1) {
        await sleep(600 * (attempt + 1))
      }
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new Error(`StockIndex ${path} 请求失败（已重试 ${STOCKINDEX_FETCH_RETRIES} 次）: ${detail}`)
}

export async function stockIndexSearch(
  q: string,
  opts: {
    market?: Market
    limit?: number
    board?: string
    industry?: string
    assetType?: string
  } = {},
): Promise<StockIndexSearchResponse> {
  return fetchJson<StockIndexSearchResponse>('/api/v1/search', {
    q: q.trim(),
    limit: Math.min(Math.max(opts.limit ?? 20, 1), 100),
    market: opts.market,
    board: opts.board,
    industry: opts.industry,
    assetType: opts.assetType,
  })
}

export async function stockIndexListStocks(
  opts: {
    market?: Market
    page?: number
    pageSize?: number
    board?: string
    industry?: string
    assetType?: string
    q?: string
  } = {},
): Promise<StockIndexListResponse> {
  const raw = await fetchJson<StockIndexListResponse & { rank_list?: StockIndexItem[] }>(
    '/api/v1/stocks',
    {
      market: opts.market ?? 'CN',
      page: opts.page ?? 1,
      pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 100),
      board: opts.board,
      industry: opts.industry,
      assetType: opts.assetType,
      q: opts.q?.trim(),
    },
  )
  return { ...raw, items: raw.items ?? raw.rank_list ?? [] }
}

export async function stockIndexGetStock(
  opts: {
    code?: string
    instrumentId?: string
    symbol?: string
    market?: Market
  },
): Promise<{ item: StockIndexItem }> {
  return fetchJson('/api/v1/stock', {
    code: opts.code,
    instrumentId: opts.instrumentId,
    symbol: opts.symbol,
    market: opts.market,
  })
}

export async function stockIndexListEtfs(
  opts: { page?: number; pageSize?: number; q?: string } = {},
): Promise<StockIndexListResponse> {
  return fetchJson('/api/v1/etfs', {
    page: opts.page ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 100),
    q: opts.q?.trim(),
  })
}

export async function stockIndexListBoards(
  opts: { market?: Market; withCount?: boolean } = {},
): Promise<StockIndexBoardListResponse> {
  return fetchJson('/api/v1/boards', {
    market: opts.market,
    withCount: opts.withCount ? '1' : undefined,
  })
}

export async function stockIndexGetBoardDetail(
  board: string,
  market?: Market,
): Promise<{ item: StockIndexBoard }> {
  return fetchJson('/api/v1/boards/detail', { board, market })
}

export async function stockIndexListBoardStocks(
  board: string,
  opts: {
    market?: Market
    page?: number
    pageSize?: number
    q?: string
    assetType?: string
  } = {},
): Promise<StockIndexListResponse & { board?: string }> {
  return fetchJson('/api/v1/boards/stocks', {
    board,
    market: opts.market,
    page: opts.page ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 100),
    q: opts.q?.trim(),
    assetType: opts.assetType,
  })
}

export async function stockIndexListIndustries(
  opts: {
    market?: Market
    level?: 1 | 2
    q?: string
    parent?: string
    withCount?: boolean
  } = {},
): Promise<StockIndexIndustryListResponse> {
  return fetchJson('/api/v1/industries', {
    market: opts.market ?? 'CN',
    level: opts.level,
    q: opts.q?.trim(),
    parent: opts.parent,
    withCount: opts.withCount ? '1' : undefined,
  })
}

export async function stockIndexGetIndustryDetail(
  code: string,
): Promise<{ item: StockIndexIndustry }> {
  return fetchJson('/api/v1/industries/detail', { code })
}

export async function stockIndexListIndustryStocks(
  industryCode: string,
  opts: { page?: number; pageSize?: number; q?: string } = {},
): Promise<StockIndexListResponse & { industryCode?: string }> {
  return fetchJson('/api/v1/industries/stocks', {
    code: industryCode,
    page: opts.page ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 50, 1), 100),
    q: opts.q?.trim(),
  })
}
