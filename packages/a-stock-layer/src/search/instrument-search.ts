/**
 * 跨市场标的搜索 — 唯一在线源：OpptrixQuant `GET /api/v1/instruments`。
 * Engine / 腾讯 / fund_list 补路已移除；normalize 在 stockIndexItemToInstrumentRef。
 */

import type { AssetClass, InstrumentRef, Market, StockListItem } from '@opptrix/shared'
import {
  canonicalCnSymbol,
  buildInstrumentNamespace,
  inferCnAssetClassFromSymbol,
  instrumentRefKey,
  normalizeInstrumentRef,
} from '@opptrix/shared'
import type { MarketDataEngine } from '../engine.js'
import { opptrixInstrumentSearch } from '../providers/stockindex/api/client.js'
import {
  opptrixInstrumentToStockIndexItem,
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
  source: 'stock_index'
}

const SEARCH_CACHE_MS = 5 * 60 * 1000
/** bump 后丢弃旧缓存（OpptrixQuant 单源 + CN:PF 对齐） */
const SEARCH_CACHE_VERSION = 4
const searchCache = new Map<string, { expires: number; items: InstrumentSearchHit[] }>()

function equityListRef(market: Market): InstrumentRef {
  const symbol = market === 'CN' ? '000001' : market === 'HK' ? '00700' : 'AAPL'
  return normalizeInstrumentRef({ market, assetClass: 'EQUITY', symbol })
}

function cacheKey(keyword: string, limit: number, markets?: Market[]): string {
  return `v${SEARCH_CACHE_VERSION}|${keyword.toLowerCase()}|${limit}|${(markets ?? []).join(',')}`
}

function hitFromStockIndexItem(item: Parameters<typeof stockIndexItemToInstrumentRef>[0]): InstrumentSearchHit | null {
  const instrument = stockIndexItemToInstrumentRef(item)
  if (!instrument) return null
  const ns = buildInstrumentNamespace(instrument)
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

function isCnFundListRow(row: StockListItem): boolean {
  const m = String(row.market ?? '').toUpperCase()
  const ind = String(row.industry ?? '')
  return row.industry === 'FUND' || m === 'PF' || m === 'OF' || ind === 'FUND' || /基金/.test(ind)
}

function hitFromStockListItem(row: StockListItem, market: Market): InstrumentSearchHit | null {
  const rawCode = String(row.code ?? '').trim()
  if (!rawCode) return null
  const code = market === 'CN' ? canonicalCnSymbol(rawCode) : rawCode
  if (market === 'CN' && isCnFundListRow(row)) {
    const instrument = normalizeInstrumentRef({
      market: 'CN',
      assetClass: 'FUND',
      symbol: code,
      exchange: 'PF',
    })
    const ns = buildInstrumentNamespace(instrument)
    return {
      code: ns,
      name: row.name ?? code,
      market: 'CN',
      assetClass: 'FUND',
      exchange: 'PF',
      instrument,
      refLabel: ns,
      source: 'stock_index',
    }
  }
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

async function searchMarketViaStockIndex(
  market: Market,
  keyword: string,
  limit: number,
): Promise<InstrumentSearchHit[]> {
  const raw = await opptrixInstrumentSearch(keyword, {
    market,
    limit: Math.min(limit, 50),
  })
  if (!raw) return []
  return raw
    .map(opptrixInstrumentToStockIndexItem)
    .map(hitFromStockIndexItem)
    .filter((h): h is InstrumentSearchHit => h != null)
    .slice(0, limit)
}

/**
 * 关键词搜索 — 仅 StockIndex；`de` 保留签名兼容，不再经 Engine 或其他 Provider。
 */
export async function searchInstrumentsOnline(
  _de: MarketDataEngine,
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
      for (const hit of await searchMarketViaStockIndex(market, kw, limit)) {
        const key = instrumentRefKey(hit.instrument)
        if (seen.has(key)) continue
        seen.add(key)
        hits.push(hit)
      }
    } catch {
      // 单市场失败不阻断其他市场
    }
  }

  const result = hits.slice(0, limit)
  searchCache.set(ck, { expires: Date.now() + SEARCH_CACHE_MS, items: result })
  return result
}

/** Discover 初选 — 标准 stock_list（StockIndex handler，经 Engine 路由） */
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
