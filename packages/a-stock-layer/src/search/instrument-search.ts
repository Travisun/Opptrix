/**
 * 跨市场标的搜索 — StockIndex Provider 主路径，腾讯搜索 CN 备用。
 */

import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import {
  canonicalCnSymbol,
  inferCnAssetClassFromSymbol,
  instrumentDisplayCode,
  instrumentRefLabel,
  normalizeInstrumentRef,
} from '@opptrix/shared'
import type { MarketDataEngine } from '../engine.js'
import type { StockIndexItem } from '../providers/stockindex/api/client.js'
import { stockIndexSearch } from '../providers/stockindex/api/client.js'
import {
  stockIndexItemToInstrumentRef,
} from '../providers/stockindex/normalize.js'
import { parseYahooSearchQuotes } from '../utils/yahoo-search.js'

export interface InstrumentSearchHit {
  code: string
  name: string | null
  market: Market
  assetClass: AssetClass
  exchange: string | null
  instrument: InstrumentRef
  refLabel: string
  source: 'stock_index' | 'tencent'
}

const SEARCH_CACHE_MS = 5 * 60 * 1000
const searchCache = new Map<string, { expires: number; items: InstrumentSearchHit[] }>()

function cacheKey(keyword: string, limit: number, markets?: Market[]): string {
  return `${keyword.toLowerCase()}|${limit}|${(markets ?? []).join(',')}`
}

function hitFromStockIndexItem(item: StockIndexItem): InstrumentSearchHit | null {
  const instrument = stockIndexItemToInstrumentRef(item)
  if (!instrument) return null
  return {
    code: instrumentDisplayCode(instrument),
    name: item.nameCn ?? item.code,
    market: instrument.market,
    assetClass: instrument.assetClass,
    exchange: instrument.exchange ?? item.exchange ?? null,
    instrument,
    refLabel: instrumentRefLabel(instrument),
    source: 'stock_index',
  }
}

async function searchMarketDirect(
  market: Market,
  keyword: string,
  limit: number,
): Promise<InstrumentSearchHit[]> {
  const resp = await stockIndexSearch(keyword, { market, limit: Math.min(limit, 50) })
  return (resp.items ?? [])
    .map(hitFromStockIndexItem)
    .filter((h): h is InstrumentSearchHit => h != null)
}

async function searchMarketViaProvider(
  de: MarketDataEngine,
  market: Market,
  keyword: string,
  limit: number,
): Promise<InstrumentSearchHit[]> {
  const resp = await de.invokeCustomMethod('stockindex', 'stockIndexSearch', [
    keyword,
    market,
    Math.min(limit, 50),
  ])
  if (resp.success && Array.isArray(resp.data) && resp.data[0]) {
    const payload = resp.data[0] as { items?: StockIndexItem[] }
    const hits = (payload.items ?? [])
      .map(hitFromStockIndexItem)
      .filter((h): h is InstrumentSearchHit => h != null)
    if (hits.length) return hits
  }
  return searchMarketDirect(market, keyword, limit)
}

async function tencentCnSearchFallback(
  de: MarketDataEngine,
  keyword: string,
  limit: number,
): Promise<InstrumentSearchHit[]> {
  const resp = await de.invokeCustomMethod('tencent', 'tencentStockSearch', [keyword])
  if (!resp.success || !Array.isArray(resp.data) || !resp.data.length) return []
  const rows = resp.data as Record<string, unknown>[]
  const out: InstrumentSearchHit[] = []
  for (const r of rows) {
    const code = canonicalCnSymbol(String(r.code ?? r.symbol ?? r.stockCode ?? ''))
    if (!code || code === '000000') continue
    const instrument = normalizeInstrumentRef({
      market: 'CN',
      assetClass: inferCnAssetClassFromSymbol(code),
      symbol: code,
    })
    out.push({
      code: instrument.symbol,
      name: String(r.name ?? r.stockName ?? r.shortname ?? code),
      market: 'CN',
      assetClass: instrument.assetClass,
      exchange: null,
      instrument,
      refLabel: instrumentRefLabel(instrument),
      source: 'tencent',
    })
    if (out.length >= limit) break
  }
  return out
}

/** 关键词搜索 — StockIndex Provider 优先，CN 空结果时腾讯备用 */
export async function searchInstrumentsOnline(
  de: MarketDataEngine,
  keyword: string,
  limit = 30,
  markets?: Market[],
): Promise<InstrumentSearchHit[]> {
  const kw = keyword.trim()
  if (kw.length < 1) return []

  const ck = cacheKey(kw, limit, markets)
  const cached = searchCache.get(ck)
  if (cached && cached.expires > Date.now()) return cached.items.slice(0, limit)

  const targetMarkets = markets?.length
    ? markets.filter(m => m === 'CN' || m === 'US' || m === 'HK')
    : (['CN', 'US', 'HK'] as Market[])

  const hits: InstrumentSearchHit[] = []
  const seen = new Set<string>()

  for (const market of targetMarkets) {
    try {
      for (const hit of await searchMarketViaProvider(de, market, kw, limit)) {
        const key = `${hit.market}:${hit.instrument.symbol}:${hit.instrument.assetClass}`
        if (seen.has(key)) continue
        seen.add(key)
        hits.push(hit)
      }
    } catch {
      // try next market / fallback
    }
  }

  if (!hits.length && (!markets?.length || markets.includes('CN'))) {
    try {
      for (const hit of await tencentCnSearchFallback(de, kw, limit)) {
        const key = `${hit.market}:${hit.instrument.symbol}`
        if (seen.has(key)) continue
        seen.add(key)
        hits.push(hit)
      }
    } catch {
      // ignore
    }
  }

  const result = hits.slice(0, limit)
  searchCache.set(ck, { expires: Date.now() + SEARCH_CACHE_MS, items: result })
  return result
}

/** Discover 初选 — 经 StockIndex Provider 分页列表 */
export async function listInstrumentsOnline(
  de: MarketDataEngine,
  market: 'CN' | 'US' | 'HK',
  opts: {
    keyword?: string
    board?: string
    page?: number
    pageSize?: number
    topN?: number
  } = {},
): Promise<{ total_universe: number; passed: number; items: InstrumentSearchHit[] }> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? opts.topN ?? 50, 1), 100)

  if (opts.board) {
    const resp = await de.invokeCustomMethod('stockindex', 'stockIndexListBoardStocks', [
      opts.board,
      market,
      opts.page ?? 1,
      pageSize,
      opts.keyword?.trim(),
    ])
    if (!resp.success || !Array.isArray(resp.data) || !resp.data[0]) {
      throw new Error(resp.error ?? 'StockIndex 板块成分获取失败')
    }
    const payload = resp.data[0] as { total?: number; items?: StockIndexItem[] }
    const items = (payload.items ?? [])
      .map(hitFromStockIndexItem)
      .filter((h): h is InstrumentSearchHit => h != null)
    return {
      total_universe: payload.total ?? items.length,
      passed: items.length,
      items,
    }
  }

  const resp = await de.invokeCustomMethod('stockindex', 'stockIndexListStocks', [
    market,
    opts.page ?? 1,
    pageSize,
    opts.board,
    undefined,
    opts.keyword?.trim(),
  ])
  if (!resp.success || !Array.isArray(resp.data) || !resp.data[0]) {
    throw new Error(resp.error ?? 'StockIndex 列表获取失败')
  }
  const payload = resp.data[0] as { total?: number; items?: StockIndexItem[] }
  const items = (payload.items ?? [])
    .map(hitFromStockIndexItem)
    .filter((h): h is InstrumentSearchHit => h != null)
  return {
    total_universe: payload.total ?? items.length,
    passed: items.length,
    items,
  }
}

/** @deprecated Yahoo 解析保留供测试；搜索不再使用 */
export { parseYahooSearchQuotes }
