/**
 * 跨市场标的搜索编排 — 扶摇（CN 名称/代码）+ Tickflow 精确代码补强。
 * 本地 HK/US 中文名录由 market-data 统一层合并（searchInstrumentsUnified includeLocal）。
 * 搜索编排：扶摇（CN 名称）+ Tickflow（精确代码）+ 本地名录 / 别名。
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
import { isCnEtfCode } from '../core/instrument.js'
import { FuyaoClient } from '../providers/tonghuashun/api/client.js'
import { fromThsCode } from '../providers/tonghuashun/api/symbols.js'
import { mapTickerItem } from '../providers/tonghuashun/normalize/index.js'
import { mapFundTickerToListItem } from '../providers/tonghuashun/normalize/fund.js'
import { TickflowClient, type TickflowInstrument } from '../providers/tickflow/api/client.js'
import { toTickflowSymbol } from '../providers/tickflow/api/symbols.js'
import {
  inferMarketFromBareCode,
  mapTickflowInstrumentToListItem,
} from '../providers/tickflow/normalize/instruments.js'
import { parseYahooSearchQuotes } from '../utils/yahoo-search.js'

export interface InstrumentSearchHit {
  code: string
  name: string | null
  market: Market
  assetClass: AssetClass
  exchange: string | null
  instrument: InstrumentRef
  refLabel: string
  /** online = 扶摇/Tickflow；stock_index 保留兼容旧调用方 */
  source: 'online' | 'stock_index'
}

const SEARCH_CACHE_MS = 5 * 60 * 1000
/** bump：扶摇+Tickflow 编排（已移除 OpptrixQuant） */
const SEARCH_CACHE_VERSION = 6
const searchCache = new Map<string, { expires: number; items: InstrumentSearchHit[] }>()

const ALLOWED_MARKETS = new Set<Market>(['CN', 'US', 'HK'])

const FUYAO_SEARCH_ASSET_TYPES = ['a-share', 'fund-etf', 'fund-lof'] as const

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

function equityListRef(market: 'CN' | 'US' | 'HK'): InstrumentRef {
  return normalizeInstrumentRef({ market, assetClass: 'EQUITY', symbol: '' })
}

function cacheKey(keyword: string, limit: number, markets?: Market[]): string {
  return `v${SEARCH_CACHE_VERSION}|${keyword.toLowerCase()}|${limit}|${(markets ?? []).join(',')}`
}

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
    source: 'online',
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
  const resolvedMarket = (row.region === 'CN' || row.region === 'US' || row.region === 'HK'
    ? row.region
    : market) as Market
  const code = resolvedMarket === 'CN' ? canonicalCnSymbol(rawCode) : rawCode
  if (resolvedMarket === 'CN' && isCnFundListRow(row)) {
    return makeHit('CN', code, row.name ?? code, 'FUND', 'PF')
  }
  const exchange = resolvedMarket === 'HK'
    ? 'HK'
    : row.market === 'SH' || row.market === 'SZ' || row.market === 'BJ'
      ? row.market
      : undefined
  const fromRow = String(row.assetClass ?? '').toUpperCase()
  const assetClass = fromRow === 'ETF' || fromRow === 'INDEX' || fromRow === 'EQUITY' || fromRow === 'FUND'
    ? fromRow as AssetClass
    : resolvedMarket === 'CN'
      ? inferCnAssetClassFromSymbol(code, exchange)
      : 'EQUITY'
  return makeHit(resolvedMarket, code, row.name ?? code, assetClass, exchange)
}

function hitFromFuyaoTicker(
  row: Record<string, unknown>,
  assetType: (typeof FUYAO_SEARCH_ASSET_TYPES)[number],
): InstrumentSearchHit | null {
  if (assetType === 'fund-etf' || assetType === 'fund-lof') {
    const list = mapFundTickerToListItem(row)
    if (list) {
      const exchange = list.market === 'SH' || list.market === 'SZ' || list.market === 'BJ'
        ? list.market
        : undefined
      return makeHit('CN', list.code, list.name || list.code, 'ETF', exchange)
    }
    // LOF / 非场内 ETF：走 FUND（场外公募扶摇可能仍覆盖不全）
    const code = fromThsCode(String(row.thscode ?? row.ticker ?? ''))
    if (!code) return null
    if (isCnEtfCode(code)) {
      return makeHit('CN', code, String(row.name ?? code), 'ETF')
    }
    return makeHit('CN', code, String(row.name ?? code), 'FUND', 'PF')
  }
  const item = mapTickerItem(row)
  if (!item.code) return null
  const exchange = item.market === 'SH' || item.market === 'SZ' || item.market === 'BJ'
    ? item.market
    : undefined
  const assetClass = inferCnAssetClassFromSymbol(item.code, exchange)
  return makeHit('CN', item.code, item.name || item.code, assetClass, exchange)
}

function hitFromTickflowInstrument(inst: TickflowInstrument): InstrumentSearchHit | null {
  try {
    const row = mapTickflowInstrumentToListItem(inst)
    const market = (row.region === 'CN' || row.region === 'US' || row.region === 'HK'
      ? row.region
      : inferMarketFromBareCode(inst.symbol || row.code)) as Market
    if (!ALLOWED_MARKETS.has(market)) return null
    return hitFromStockListItem(row, market)
  } catch {
    return null
  }
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

function aliasHitFromTarget(target: SearchAliasTarget): InstrumentSearchHit {
  return makeHit(target.market, target.symbol, target.displayName, 'EQUITY', target.market === 'HK' ? 'HK' : undefined)
}

/** 关键词是否像交易代码（精确查 Tickflow） */
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

function candidateTickflowSymbols(keyword: string, allowed: Set<Market>): string[] {
  const kw = keyword.trim()
  const out: string[] = []
  const push = (market: Market, code: string) => {
    if (!allowed.has(market)) return
    try {
      out.push(toTickflowSymbol(market, code))
    } catch {
      /* skip */
    }
  }

  if (/\.(SH|SZ|BJ|US|HK)$/i.test(kw)) {
    out.push(kw.toUpperCase())
    return out
  }

  if (/^[A-Za-z][A-Za-z0-9.-]{0,11}$/.test(kw) && /[A-Za-z]/.test(kw)) {
    push('US', kw)
    return out
  }

  if (/^\d{6}$/.test(kw)) {
    push('CN', kw)
    return out
  }

  // 1–5 位裸数字：优先港股五位 pad（700→00700.HK）；不硬推 CN
  if (/^\d{1,5}$/.test(kw)) {
    push('HK', kw)
    return out
  }

  const inferred = inferMarketFromBareCode(kw)
  push(inferred, kw)
  return out
}

function dedupeHits(hits: InstrumentSearchHit[]): InstrumentSearchHit[] {
  const seen = new Set<string>()
  const out: InstrumentSearchHit[] = []
  for (const hit of hits) {
    const key = instrumentRefKey(hit.instrument)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(hit)
  }
  return out
}

async function searchFuyaoCn(keyword: string, limit: number): Promise<InstrumentSearchHit[]> {
  const client = FuyaoClient.fromConfig()
  if (!client) return []
  const perType = Math.min(Math.max(limit, 5), 20)
  const batches = await Promise.all(
    FUYAO_SEARCH_ASSET_TYPES.map(async assetType => {
      try {
        const data = await client.tickersSearch(keyword, perType, assetType)
        const items = data.item ?? []
        return items
          .map(row => hitFromFuyaoTicker(row, assetType))
          .filter((h): h is InstrumentSearchHit => h != null)
      } catch {
        return [] as InstrumentSearchHit[]
      }
    }),
  )
  return batches.flat()
}

async function searchTickflowExact(
  keyword: string,
  allowed: Set<Market>,
): Promise<InstrumentSearchHit[]> {
  if (!looksLikeInstrumentCode(keyword)) return []
  const client = TickflowClient.fromConfig()
  if (!client) return []
  const symbols = candidateTickflowSymbols(keyword, allowed)
  if (!symbols.length) return []
  try {
    const json = await client.getInstruments({ symbols: symbols.join(',') })
    const rows = (json.data ?? []) as TickflowInstrument[]
    return rows
      .map(hitFromTickflowInstrument)
      .filter((h): h is InstrumentSearchHit => h != null && allowed.has(h.market))
  } catch {
    return []
  }
}

async function enrichAliasHit(target: SearchAliasTarget): Promise<InstrumentSearchHit> {
  const fallback = aliasHitFromTarget(target)
  const client = TickflowClient.fromConfig()
  if (!client) return fallback
  try {
    const symbol = toTickflowSymbol(target.market, target.symbol)
    const json = await client.getInstruments({ symbols: symbol })
    const rows = (json.data ?? []) as TickflowInstrument[]
    const hits = rows
      .map(hitFromTickflowInstrument)
      .filter((h): h is InstrumentSearchHit => h != null)
    const want = canonicalSymbolForMarket(target.market, target.symbol)
    const exact = hits.find(
      h =>
        h.market === target.market
        && canonicalSymbolForMarket(h.market, h.instrument.symbol) === want,
    )
    if (exact) {
      return { ...exact, name: exact.name || target.displayName }
    }
  } catch {
    /* fallback */
  }
  return fallback
}

async function injectAliasHits(
  keyword: string,
  hits: InstrumentSearchHit[],
  allowed: Set<Market>,
): Promise<InstrumentSearchHit[]> {
  const targets = resolveSearchAliasTargets(keyword).filter(t => allowed.has(t.market))
  if (!targets.length) return hits
  const have = new Set(hits.map(h => instrumentRefKey(h.instrument)))
  const missing = targets.filter(t => {
    const ref = normalizeInstrumentRef({
      market: t.market,
      assetClass: 'EQUITY',
      symbol: t.symbol,
      exchange: t.market === 'HK' ? 'HK' : undefined,
    })
    return !have.has(instrumentRefKey(ref))
  })
  if (!missing.length) return hits
  const aliasHits = await Promise.all(missing.map(enrichAliasHit))
  return dedupeHits([...aliasHits, ...hits])
}

/**
 * 关键词搜索 — 扶摇（CN）+ Tickflow 精确代码；`de` 保留签名兼容。
 * 未配置扶摇 Key 时 CN 名称搜为空（仍可能有 Tickflow 精确 / 别名）；美港中文名依赖本地名录。
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
    ? markets.filter(m => ALLOWED_MARKETS.has(m))
    : (['CN', 'US', 'HK'] as Market[])
  const allowed = new Set(targetMarkets)
  if (!targetMarkets.length) return []

  const wantCn = allowed.has('CN')
  const [fuyaoHits, tickflowHits] = await Promise.all([
    wantCn
      ? searchFuyaoCn(kw, limit).catch(() => [] as InstrumentSearchHit[])
      : Promise.resolve([] as InstrumentSearchHit[]),
    searchTickflowExact(kw, allowed).catch(() => [] as InstrumentSearchHit[]),
  ])

  let hits = dedupeHits([...fuyaoHits, ...tickflowHits].filter(h => allowed.has(h.market)))
  hits = await injectAliasHits(kw, hits, allowed)
  hits = rankInstrumentSearchHits(hits, kw)

  const result = hits.slice(0, limit)
  searchCache.set(ck, { expires: Date.now() + SEARCH_CACHE_MS, items: result })
  return result
}

/** Discover 初选 — 标准 stock_list（经 Engine 路由） */
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
