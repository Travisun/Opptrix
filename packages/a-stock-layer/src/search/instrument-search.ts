/**
 * 跨市场标的搜索 — 标准 instrument_search 主路径，腾讯 CN 搜索为自定义备用。
 */

import type { AssetClass, InstrumentRef, Market, StockListItem } from '@opptrix/shared'
import {
  canonicalCnSymbol,
  buildInstrumentNamespace,
  inferCnAssetClassFromSymbol,
  instrumentRefKey,
  normalizeInstrumentRef,
} from '@opptrix/shared'
import { exchangeFromTencentSecSymbol } from '../core/provider-wire.js'
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

function equityListRef(market: Market): InstrumentRef {
  const symbol = market === 'CN' ? '000001' : market === 'HK' ? '00700' : 'AAPL'
  return normalizeInstrumentRef({ market, assetClass: 'EQUITY', symbol })
}

function cacheKey(keyword: string, limit: number, markets?: Market[]): string {
  return `${keyword.toLowerCase()}|${limit}|${(markets ?? []).join(',')}`
}

function hitFromStockIndexItem(item: StockIndexItem): InstrumentSearchHit | null {
  const instrument = stockIndexItemToInstrumentRef(item)
  if (!instrument) return null
  const ns = item.instrumentId?.trim() || buildInstrumentNamespace(instrument)
  return {
    code: ns,
    name: item.nameCn ?? item.code,
    market: instrument.market,
    assetClass: instrument.assetClass,
    exchange: instrument.exchange ?? item.exchange ?? null,
    instrument,
    refLabel: ns,
    source: 'stock_index',
  }
}

function exchangeFromTencentCode(raw: string): 'SH' | 'SZ' | 'BJ' | undefined {
  return exchangeFromTencentSecSymbol(raw)
}

function hitFromStockListItem(row: StockListItem, market: Market): InstrumentSearchHit | null {
  const rawCode = String(row.code ?? '').trim()
  if (!rawCode) return null
  const code = market === 'CN' ? canonicalCnSymbol(rawCode) : rawCode
  const exchange = market === 'HK'
    ? 'HK'
    : row.market === 'SH' || row.market === 'SZ' || row.market === 'BJ'
      ? row.market
      : undefined
  const instrument = normalizeInstrumentRef({
    market,
    assetClass: market === 'CN' ? inferCnAssetClassFromSymbol(code, exchange) : 'EQUITY',
    symbol: code,
    exchange,
  })
  const ns = buildInstrumentNamespace(instrument)
  return {
    code: ns,
    name: row.name ?? code,
    market,
    assetClass: instrument.assetClass,
    exchange: instrument.exchange ?? exchange ?? null,
    instrument,
    refLabel: ns,
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

async function searchMarketViaStandardApi(
  de: MarketDataEngine,
  market: Market,
  keyword: string,
  limit: number,
): Promise<InstrumentSearchHit[]> {
  const r = await de.queryInstrumentData(equityListRef(market), 'instrument_search', {
    keyword,
    pageSize: Math.min(limit, 50),
  })
  if (r.success && 'data' in r && Array.isArray(r.data) && r.data.length) {
    const hits = (r.data as StockListItem[])
      .map(row => hitFromStockListItem(row, market))
      .filter((h): h is InstrumentSearchHit => h != null)
    if (hits.length) return hits.slice(0, limit)
  }
  return searchMarketDirect(market, keyword, limit)
}

/** 腾讯 stock 搜索 — 自定义方法，仅作 CN 空结果备用 */
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
    const rawCode = String(r.code ?? r.symbol ?? r.stockCode ?? '')
    const exchange = exchangeFromTencentCode(rawCode)
    const code = canonicalCnSymbol(rawCode.replace(/^(sh|sz|bj)/i, ''))
    if (!code || code === '000000') continue
    const instrument = normalizeInstrumentRef({
      market: 'CN',
      assetClass: inferCnAssetClassFromSymbol(code, exchange),
      symbol: code,
      exchange,
    })
    const ns = buildInstrumentNamespace(instrument)
    out.push({
      code: ns,
      name: String(r.name ?? r.stockName ?? r.shortname ?? code),
      market: 'CN',
      assetClass: instrument.assetClass,
      exchange: instrument.exchange ?? null,
      instrument,
      refLabel: ns,
      source: 'tencent',
    })
    if (out.length >= limit) break
  }
  return out
}

/** 关键词搜索 — 标准 instrument_search，CN 空结果时腾讯自定义方法备用 */
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
      for (const hit of await searchMarketViaStandardApi(de, market, kw, limit)) {
        const key = instrumentRefKey(hit.instrument)
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
        const key = instrumentRefKey(hit.instrument)
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

/** Discover 初选 — 标准 stock_list（含板块过滤） */
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
  const r = await de.queryInstrumentData(equityListRef(market), 'stock_list', {
    keyword: opts.keyword?.trim(),
    page: opts.page ?? 1,
    pageSize,
    boardKey: opts.board,
  })
  if (!r.success) {
    const err = 'error' in r && r.error ? String(r.error) : '标的列表获取失败'
    throw new Error(err)
  }
  const rows = ('data' in r && Array.isArray(r.data) ? r.data : []) as StockListItem[]
  const items = rows
    .map(row => hitFromStockListItem(row, market))
    .filter((h): h is InstrumentSearchHit => h != null)
  return {
    total_universe: items.length,
    passed: items.length,
    items,
  }
}

/** @deprecated Yahoo 解析保留供测试；搜索不再使用 */
export { parseYahooSearchQuotes }
