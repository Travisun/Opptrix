/**
 * 跨市场标的搜索 — 唯一在线源：OpptrixQuant `GET /api/v1/instruments`。
 * 扶摇/Tickflow 搜索编排已移除；normalize 在 stockIndexItemToInstrumentRef。
 */

import type { AssetClass, InstrumentRef, Market, StockListItem } from '@opptrix/shared'
import {
  canonicalCnSymbol,
  canonicalSymbolForMarket,
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
  source: 'stock_index' | 'online'
}

const SEARCH_CACHE_MS = 5 * 60 * 1000
/** bump：恢复 OpptrixQuant 唯一在线搜索，去掉扶摇/Tickflow 编排 */
const SEARCH_CACHE_VERSION = 7
const searchCache = new Map<string, { expires: number; items: InstrumentSearchHit[] }>()

/** 常见中文别名 → 美/港标的（本地名录未灌满时兜底） */
export interface SearchAliasTarget {
  market: Market
  symbol: string
  displayName: string
}

const SEARCH_ALIAS_TABLE: ReadonlyArray<{ aliases: readonly string[]; targets: readonly SearchAliasTarget[] }> = [
  {
    aliases: ['腾讯', '腾讯控股'],
    targets: [{ market: 'HK', symbol: '00700', displayName: '腾讯控股' }],
  },
  {
    aliases: ['阿里', '阿里巴巴'],
    targets: [
      { market: 'US', symbol: 'BABA', displayName: '阿里巴巴' },
      { market: 'HK', symbol: '09988', displayName: '阿里巴巴-SW' },
    ],
  },
  {
    aliases: ['苹果'],
    targets: [{ market: 'US', symbol: 'AAPL', displayName: 'Apple' }],
  },
]

function makeHit(
  market: Market,
  symbol: string,
  name: string | null,
  assetClass: AssetClass,
  exchange?: string | null,
): InstrumentSearchHit {
  const instrument = normalizeInstrumentRef({
    market,
    assetClass,
    symbol,
    exchange: exchange ?? (market === 'HK' ? 'HK' : undefined),
  })
  const ns = buildInstrumentNamespace(instrument)
  return {
    code: ns,
    name: name ?? symbol,
    market: instrument.market,
    assetClass: instrument.assetClass,
    exchange: instrument.exchange ?? exchange ?? null,
    instrument,
    refLabel: ns,
    source: 'stock_index',
  }
}

function aliasHitFromTarget(target: SearchAliasTarget): InstrumentSearchHit {
  return makeHit(target.market, target.symbol, target.displayName, 'EQUITY', target.market === 'HK' ? 'HK' : undefined)
}

function stripLeadingZeros(s: string): string {
  const t = s.replace(/^0+/, '')
  return t || '0'
}

function symbolMatchForms(market: Market, symbol: string): { canon: string; stripped: string } {
  const canon = canonicalSymbolForMarket(market, symbol).toUpperCase()
  return { canon, stripped: stripLeadingZeros(canon) }
}

function keywordDigitForms(kw: string): { raw: string; stripped: string; isPureDigits: boolean } {
  const raw = kw.trim().toUpperCase()
  const digitsOnly = /^\d+$/.test(raw)
  return {
    raw,
    stripped: digitsOnly ? stripLeadingZeros(raw) : raw,
    isPureDigits: digitsOnly,
  }
}

/**
 * 相关性分：精确 symbol（含港股 5 位 / 去前导 0）> 前缀 > 名称包含；
 * 纯数字码时压低无关 FUND（如 000700 货币基金压在 00700 腾讯之后）。
 */
export function scoreInstrumentSearchHit(hit: InstrumentSearchHit, keyword: string): number {
  const kw = keyword.trim()
  if (!kw) return 0
  const forms = keywordDigitForms(kw)
  const { canon, stripped } = symbolMatchForms(hit.market, hit.instrument.symbol)
  const name = (hit.name ?? '').toUpperCase()
  const kwUpper = forms.raw

  let score = 0
  if (canon === kwUpper || (forms.isPureDigits && stripped === forms.stripped)) {
    score = 1000
  } else if (
    canon.startsWith(kwUpper)
    || (forms.isPureDigits && stripped.startsWith(forms.stripped))
  ) {
    score = 800
  } else if (name.includes(kwUpper) || (hit.name ?? '').includes(kw)) {
    score = 400
  } else {
    score = 100
  }

  if (score >= 1000 && hit.assetClass === 'EQUITY') score += 20
  if (score >= 1000 && hit.assetClass === 'ETF') score += 10

  if (forms.isPureDigits && hit.assetClass === 'FUND' && score < 1000) {
    score -= 500
  }

  const aliasBoost = resolveSearchAliasTargets(kw).some(t => {
    if (t.market !== hit.market) return false
    return canonicalSymbolForMarket(t.market, t.symbol)
      === canonicalSymbolForMarket(hit.market, hit.instrument.symbol)
  })
  if (aliasBoost) score = Math.max(score, 950)

  return score
}

export function rankInstrumentSearchHits(
  hits: InstrumentSearchHit[],
  keyword: string,
): InstrumentSearchHit[] {
  return hits
    .map((hit, index) => ({ hit, index, score: scoreInstrumentSearchHit(hit, keyword) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.hit)
}

export function resolveSearchAliasTargets(keyword: string): SearchAliasTarget[] {
  const kw = keyword.trim()
  if (!kw) return []
  for (const row of SEARCH_ALIAS_TABLE) {
    if (row.aliases.some(a => a === kw || kw.includes(a))) {
      return [...row.targets]
    }
  }
  return []
}

/** 关键词是否像交易代码 */
export function looksLikeInstrumentCode(keyword: string): boolean {
  const kw = keyword.trim()
  if (!kw || kw.length > 16) return false
  // 美股 ticker
  if (/^[A-Za-z][A-Za-z0-9.-]{0,11}$/.test(kw) && /[A-Za-z]/.test(kw)) return true
  // A 股 6 位 / 港股短码（1–5 位，精确补强 pad 五位）
  if (/^\d{1,6}$/.test(kw)) return true
  // 带交易所后缀
  if (/^[A-Za-z0-9]+\.(SH|SZ|BJ|US|HK)$/i.test(kw)) return true
  return false
}


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
