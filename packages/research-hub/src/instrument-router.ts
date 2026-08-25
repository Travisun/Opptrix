import type { ResearchResult } from '@opptrix/shared'
import {
  fail,
  hasApplicationCapability,
  instrumentDisplayCode,
  instrumentRefKey,
  instrumentRefsFromList,
  normalizeInstrumentChart,
  normalizeInstrumentRef,
  normalizeInstrumentSnapshot,
  canonicalSymbolForMarket,
  parseInstrumentRef,
  quoteFromProviderRow,
  resolveInstrumentCapabilities,
  resolveInstrumentFromParams,
  type InstrumentRef,
  type LocalInstrumentInsights,
  type UnifiedInstrumentQuote,
  type UnifiedInstrumentSearchHit,
} from '@opptrix/shared'
import {
  classifyQuoteFailureMessage,
  isQuoteFailedReason,
  type QuoteFailedReason,
} from './quote-failure.js'

export type { QuoteFailedReason } from './quote-failure.js'

export type InstrumentRouteHandlers = {
  stockDetail: (ref: InstrumentRef) => Promise<ResearchResult>
  etfSnapshot: (ref: InstrumentRef) => Promise<ResearchResult>
  fundSnapshot: (ref: InstrumentRef) => Promise<ResearchResult>
  usSnapshot: (symbol: string) => Promise<ResearchResult>
  regionalSnapshot: (market: 'HK', symbol: string) => Promise<ResearchResult>
  cryptoSnapshot: (pair: string) => Promise<ResearchResult>
  stockQuotes: (refs: InstrumentRef[]) => Promise<ResearchResult>
  usRealtime: (symbol: string) => Promise<ResearchResult>
  regionalRealtime: (market: 'HK', symbol: string) => Promise<ResearchResult>
  cryptoRealtime: (pair: string) => Promise<ResearchResult>
  stockChart: (
    code: string,
    period: string,
    count: number,
    before: string,
    tail: number,
    market?: string,
  ) => Promise<ResearchResult>
  usKline: (
    symbol: string,
    period: string,
    count: number,
    before: string,
    tail: number,
  ) => Promise<ResearchResult>
  regionalKline: (
    market: 'HK',
    symbol: string,
    period: string,
    count: number,
    before: string,
    tail: number,
  ) => Promise<ResearchResult>
  cryptoKline: (pair: string, period: string, count: number) => Promise<ResearchResult>
  stockCyq: (ref: InstrumentRef) => Promise<ResearchResult>
  institutionRating: (ref: InstrumentRef, groups?: string[]) => Promise<ResearchResult>
  institutionReport: (params: Record<string, unknown>, groups?: string[]) => Promise<ResearchResult>
  searchInstruments: (
    keyword: string,
    limit: number,
    markets?: string[],
    includeLocal?: boolean,
  ) => Promise<ResearchResult>
  /** CN 本地离线因子摘要 — 可选，不阻塞 snapshot */
  localInsights?: (ref: InstrumentRef) => LocalInstrumentInsights | null
}

function wrapSnapshot(
  ref: InstrumentRef,
  resp: ResearchResult,
  handlers: InstrumentRouteHandlers,
): ResearchResult {
  if (!resp.success || !resp.data || typeof resp.data !== 'object') return resp
  const insights = handlers.localInsights?.(ref) ?? null
  const snapshot = normalizeInstrumentSnapshot(
    ref,
    resp.data as Record<string, unknown>,
    { localInsights: insights, source: insights ? 'mixed' : 'live' },
  )
  return { ...resp, data: snapshot }
}

function wrapChart(ref: InstrumentRef, period: string, resp: ResearchResult): ResearchResult {
  if (!resp.success || !resp.data || typeof resp.data !== 'object') return resp
  const chart = normalizeInstrumentChart(ref, period, resp.data as Record<string, unknown>)
  return { ...resp, data: chart }
}

function quoteRowMatchesRef(row: Record<string, unknown>, ref: InstrumentRef): boolean {
  const code = String(row.code ?? '')
  if (!code) return false
  if (code === ref.symbol) return true
  return canonicalSymbolForMarket(ref.market, code) === ref.symbol
}

/** Match a quote row to ref by symbol (+ exchange). Never trust sparse/filtered array index. */
function findQuoteRowForRef(
  rows: Record<string, unknown>[],
  ref: InstrumentRef,
): Record<string, unknown> | undefined {
  return rows.find(r => {
    if (!quoteRowMatchesRef(r, ref)) return false
    if (!ref.exchange || r.exchange == null || r.exchange === '') return true
    return String(r.exchange).toUpperCase() === ref.exchange.toUpperCase()
  })
}

export async function routeInstrumentSnapshot(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const ref = resolveInstrumentFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')
  const caps = resolveInstrumentCapabilities(ref)
  if (!caps.capabilities.includes('snapshot')) {
    return fail('该标的类型暂不支持快照')
  }

  if (ref.market === 'CN' && ref.assetClass === 'ETF') {
    return wrapSnapshot(ref, await handlers.etfSnapshot(ref), handlers)
  }
  if (ref.market === 'CN' && ref.assetClass === 'FUND') {
    return wrapSnapshot(ref, await handlers.fundSnapshot(ref), handlers)
  }
  if (ref.market === 'CN') {
    return wrapSnapshot(ref, await handlers.stockDetail(ref), handlers)
  }
  if (ref.market === 'US') {
    return wrapSnapshot(ref, await handlers.usSnapshot(ref.symbol), handlers)
  }
  if (ref.market === 'HK') {
    return wrapSnapshot(ref, await handlers.regionalSnapshot('HK', ref.symbol), handlers)
  }
  if (ref.market === 'JP' || ref.market === 'KR') {
    return fail(ref.market === 'JP' ? '日股暂未接入' : '韩股暂未接入')
  }
  if (ref.market === 'CRYPTO') {
    return wrapSnapshot(ref, await handlers.cryptoSnapshot(instrumentDisplayCode(ref)), handlers)
  }
  return fail('不支持的市场')
}

/** 每市场组实时行情的最大并发（tickflow maxConcurrent = 5） */
const MAX_QUOTE_GROUP_CONCURRENCY = 5

export interface FailedInstrumentRef {
  instrument: InstrumentRef
  code: string
  reason: QuoteFailedReason
}

function resolveQuoteRefs(params: Record<string, unknown>): InstrumentRef[] {
  const rawList = params.instruments ?? params.refs ?? params.codes
  if (!Array.isArray(rawList)) return []
  const refs = instrumentRefsFromList(rawList)
  if (refs.length) return refs
  const fallback: InstrumentRef[] = []
  for (const item of rawList) {
    const ref = parseInstrumentRef(item)
    if (ref) fallback.push(ref)
  }
  return fallback
}

function failedQuoteForRef(ref: InstrumentRef, reason: QuoteFailedReason): FailedInstrumentRef {
  const instrument = normalizeInstrumentRef(ref)
  return { instrument, code: instrumentDisplayCode(instrument), reason }
}

/** 无 Provider / 未启用 → no_provider；上游明确未收录 → not_found；其它查询失败 → error */
function quoteFailureReason(message: string): QuoteFailedReason {
  return classifyQuoteFailureMessage(message)
}

/** resp.success 为 false → 按文案归类；成功但 data 非对象 → Provider 返回空 */
function classifyQuoteResponseFailure(resp: ResearchResult): QuoteFailedReason {
  return resp.success ? 'empty' : quoteFailureReason(String(resp.message ?? ''))
}

function quoteRowsFromResponse(resp: ResearchResult): Record<string, unknown>[] | null {
  if (!resp.success || !resp.data || typeof resp.data !== 'object') return null
  return (resp.data as { quotes?: Record<string, unknown>[] }).quotes ?? []
}

/** Hub 侧 stockQuotes 明细失败项（code 为 instrumentDisplayCode，reason 已归类） */
interface HubFailedItem {
  code: string
  reason: string
}

/** 读取 resp.data.failed 并按 code 归类到 ref */
function cnBatchHubFailed(resp: ResearchResult): Map<string, QuoteFailedReason> {
  const out = new Map<string, QuoteFailedReason>()
  if (!resp.success || !resp.data || typeof resp.data !== 'object') return out
  const raw = (resp.data as { failed?: HubFailedItem[] }).failed
  if (!Array.isArray(raw)) return out
  for (const item of raw) {
    if (isQuoteFailedReason(item.reason)) out.set(item.code, item.reason)
  }
  return out
}

function collectCnBatchQuotes(
  refs: InstrumentRef[],
  resp: ResearchResult,
  quotes: UnifiedInstrumentQuote[],
  failed: FailedInstrumentRef[],
  sourceFor: (ref: InstrumentRef) => UnifiedInstrumentQuote['source'],
): void {
  const rows = quoteRowsFromResponse(resp)
  if (rows) {
    const hubFailed = cnBatchHubFailed(resp)
    for (const ref of refs) {
      const row = findQuoteRowForRef(rows, ref)
      if (row) {
        quotes.push(quoteFromProviderRow(ref, row, sourceFor(ref)))
        continue
      }
      // 未命中行时优先用 hub 侧已归类的明细原因；无则按原语义记 empty
      failed.push(failedQuoteForRef(ref, hubFailed.get(instrumentDisplayCode(ref)) ?? 'empty'))
    }
    return
  }
  const reason = classifyQuoteResponseFailure(resp)
  for (const ref of refs) failed.push(failedQuoteForRef(ref, reason))
}

interface RealtimeQuoteCall {
  ref: InstrumentRef
  call: () => Promise<ResearchResult>
}

async function collectRealtimeQuotesBounded(
  items: RealtimeQuoteCall[],
  quotes: UnifiedInstrumentQuote[],
  failed: FailedInstrumentRef[],
): Promise<void> {
  for (let i = 0; i < items.length; i += MAX_QUOTE_GROUP_CONCURRENCY) {
    const chunk = items.slice(i, i + MAX_QUOTE_GROUP_CONCURRENCY)
    await Promise.all(chunk.map(async ({ ref, call }) => {
      const resp = await call()
      if (resp.success && resp.data && typeof resp.data === 'object') {
        quotes.push(quoteFromProviderRow(ref, resp.data as Record<string, unknown>))
        return
      }
      failed.push(failedQuoteForRef(ref, classifyQuoteResponseFailure(resp)))
    }))
  }
}

function localSourceFor(handlers: InstrumentRouteHandlers, ref: InstrumentRef): UnifiedInstrumentQuote['source'] {
  return handlers.localInsights?.(ref) ? 'mixed' : 'live'
}

export async function routeInstrumentQuotes(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const refs = resolveQuoteRefs(params)
  if (!refs.length) return fail('instruments 必填')

  const quotes: UnifiedInstrumentQuote[] = []
  const failed: FailedInstrumentRef[] = []
  for (const ref of refs) {
    if (ref.market === 'JP' || ref.market === 'KR') failed.push(failedQuoteForRef(ref, 'unsupported'))
  }

  const tasks: Promise<void>[] = []
  const cnRefs = refs.filter(r => r.market === 'CN' && r.assetClass !== 'ETF' && r.assetClass !== 'FUND')
  if (cnRefs.length) {
    tasks.push(handlers.stockQuotes(cnRefs).then(resp =>
      collectCnBatchQuotes(cnRefs, resp, quotes, failed, ref => localSourceFor(handlers, ref)),
    ))
  }
  const etfRefs = refs.filter(r => r.market === 'CN' && r.assetClass === 'ETF')
  if (etfRefs.length) {
    tasks.push(handlers.stockQuotes(etfRefs).then(resp =>
      collectCnBatchQuotes(etfRefs, resp, quotes, failed, () => 'mixed'),
    ))
  }
  const fundRefs = refs.filter(r => r.market === 'CN' && r.assetClass === 'FUND')
  if (fundRefs.length) {
    tasks.push(handlers.stockQuotes(fundRefs).then(resp =>
      collectCnBatchQuotes(fundRefs, resp, quotes, failed, ref => localSourceFor(handlers, ref)),
    ))
  }
  const usRefs = refs.filter(r => r.market === 'US')
  if (usRefs.length) {
    tasks.push(collectRealtimeQuotesBounded(
      usRefs.map(ref => ({ ref, call: () => handlers.usRealtime(ref.symbol) })),
      quotes,
      failed,
    ))
  }
  const hkRefs = refs.filter(r => r.market === 'HK')
  if (hkRefs.length) {
    tasks.push(collectRealtimeQuotesBounded(
      hkRefs.map(ref => ({ ref, call: () => handlers.regionalRealtime('HK', ref.symbol) })),
      quotes,
      failed,
    ))
  }
  const cryptoRefs = refs.filter(r => r.market === 'CRYPTO')
  if (cryptoRefs.length) {
    tasks.push(collectRealtimeQuotesBounded(
      cryptoRefs.map(ref => ({ ref, call: () => handlers.cryptoRealtime(instrumentDisplayCode(ref)) })),
      quotes,
      failed,
    ))
  }

  await Promise.all(tasks)

  if (!quotes.length) return fail('行情获取失败')
  return { success: true, message: `更新 ${quotes.length} 只`, data: { quotes, failed }, elapsed: 0 }
}

export async function routeInstrumentChart(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const ref = resolveInstrumentFromParams(params)
  if (!ref) return fail('instrument 必填')
  const period = String(params.period ?? 'daily')
  const count = params.count != null ? Number(params.count) : 120
  const before = String(params.before ?? '')
  const tail = params.tail != null ? Number(params.tail) : 0
  const capKey = period === 'intraday' ? 'chart_intraday' : 'chart_daily'
  if (!resolveInstrumentCapabilities(ref).capabilities.includes(capKey)) {
    return fail('该标的类型暂不支持图表')
  }

  if (ref.market === 'CN') {
    return wrapChart(
      ref,
      period,
      await handlers.stockChart(ref.symbol, period, count, before, tail, ref.exchange),
    )
  }
  if (ref.market === 'US') {
    return wrapChart(ref, period, await handlers.usKline(ref.symbol, period, count, before, tail))
  }
  if (ref.market === 'HK') {
    return wrapChart(ref, period, await handlers.regionalKline('HK', ref.symbol, period, count, before, tail))
  }
  if (ref.market === 'JP' || ref.market === 'KR') {
    return fail(ref.market === 'JP' ? '日股暂未接入' : '韩股暂未接入')
  }
  if (ref.market === 'CRYPTO') {
    return wrapChart(ref, period, await handlers.cryptoKline(instrumentDisplayCode(ref), period, count))
  }
  return fail('不支持的市场')
}

export async function routeInstrumentSearch(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const keyword = String(params.keyword ?? params.q ?? '').trim()
  if (keyword.length < 1) return fail('keyword 必填')
  const limit = params.limit != null ? Number(params.limit) : 30
  const markets = Array.isArray(params.markets) ? params.markets.map(String) : undefined
  // 默认合并本地名录（HK/US 中文名）；显式 include_local=false 可关闭
  const includeLocal = params.include_local === true
  return handlers.searchInstruments(keyword, limit, markets, includeLocal)
}

export function routeInstrumentCapabilities(params: Record<string, unknown>): ResearchResult {
  const ref = resolveInstrumentFromParams(params)
  if (!ref) return fail('instrument 必填')
  const caps = resolveInstrumentCapabilities(ref)
  return { success: true, message: '标的能力', data: caps, elapsed: 0 }
}

export async function routeInstrumentCyq(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const ref = resolveInstrumentFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')
  if (!hasApplicationCapability(ref, 'cyq')) {
    return fail('该标的暂不支持筹码分布')
  }
  if (ref.market !== 'CN') return fail('筹码分布仅支持 A 股')
  return handlers.stockCyq(ref)
}

export async function routeInstrumentInstitutionRating(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const ref = resolveInstrumentFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')
  if (!hasApplicationCapability(ref, 'institution_rating')) {
    return fail('该标的暂不支持机构评级')
  }
  if (ref.market !== 'CN') return fail('机构评级仅支持 A 股')
  const groups = Array.isArray(params.groups) ? params.groups.map(String) : undefined
  return handlers.institutionRating(ref, groups)
}

export async function routeInstrumentInstitutionReport(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const ref = resolveInstrumentFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')
  if (!hasApplicationCapability(ref, 'institution_rating')) {
    return fail('该标的暂不支持机构研报')
  }
  if (ref.market !== 'CN') return fail('机构研报仅支持 A 股')
  const groups = Array.isArray(params.groups) ? params.groups.map(String) : undefined
  return handlers.institutionReport({ ...params, instrument: ref }, groups)
}

export type { UnifiedInstrumentSearchHit }
