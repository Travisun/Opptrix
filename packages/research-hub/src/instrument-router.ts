import type { ResearchResult } from '@opptrix/shared'
import {
  fail,
  hasApplicationCapability,
  instrumentDisplayCode,
  instrumentRefKey,
  instrumentRefsFromList,
  normalizeInstrumentChart,
  normalizeInstrumentSnapshot,
  parseInstrumentRef,
  quoteFromProviderRow,
  resolveInstrumentCapabilities,
  resolveInstrumentFromParams,
  type InstrumentRef,
  type LocalInstrumentInsights,
  type UnifiedInstrumentQuote,
  type UnifiedInstrumentSearchHit,
} from '@opptrix/shared'

export type InstrumentRouteHandlers = {
  stockDetail: (ref: InstrumentRef) => Promise<ResearchResult>
  etfSnapshot: (code: string) => Promise<ResearchResult>
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
    return wrapSnapshot(ref, await handlers.etfSnapshot(ref.symbol), handlers)
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

export async function routeInstrumentQuotes(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const rawList = params.instruments ?? params.refs ?? params.codes
  let refs: InstrumentRef[] = []
  if (Array.isArray(rawList)) {
    refs = instrumentRefsFromList(rawList)
    if (!refs.length) {
      for (const item of rawList) {
        const ref = parseInstrumentRef(item)
        if (ref) refs.push(ref)
      }
    }
  }
  if (!refs.length) return fail('instruments 必填')

  const quotes: UnifiedInstrumentQuote[] = []
  const cnRefs = refs.filter(r => r.market === 'CN' && r.assetClass !== 'ETF')
  if (cnRefs.length) {
    const resp = await handlers.stockQuotes(cnRefs)
    if (resp.success && resp.data && typeof resp.data === 'object') {
      const rows = (resp.data as { quotes?: Record<string, unknown>[] }).quotes ?? []
      for (let i = 0; i < cnRefs.length; i++) {
        const ref = cnRefs[i]!
        const row = rows[i] ?? rows.find(r => {
          const code = String(r.code ?? '')
          return code === ref.symbol && (
            !ref.exchange
            || !r.exchange
            || String(r.exchange).toUpperCase() === ref.exchange.toUpperCase()
          )
        })
        if (row) {
          quotes.push(quoteFromProviderRow(ref, row, handlers.localInsights?.(ref) ? 'mixed' : 'live'))
        }
      }
    }
  }

  for (const ref of refs) {
    if (ref.market === 'US') {
      const resp = await handlers.usRealtime(ref.symbol)
      if (resp.success && resp.data && typeof resp.data === 'object') {
        quotes.push(quoteFromProviderRow(ref, resp.data as Record<string, unknown>))
      }
    }
    if (ref.market === 'HK') {
      const resp = await handlers.regionalRealtime('HK', ref.symbol)
      if (resp.success && resp.data && typeof resp.data === 'object') {
        quotes.push(quoteFromProviderRow(ref, resp.data as Record<string, unknown>))
      }
    }
    if (ref.market === 'JP' || ref.market === 'KR') {
      // 日股/韩股暂未接入 — 跳过
    }
    if (ref.market === 'CRYPTO') {
      const pair = instrumentDisplayCode(ref)
      const resp = await handlers.cryptoRealtime(pair)
      if (resp.success && resp.data && typeof resp.data === 'object') {
        quotes.push(quoteFromProviderRow(ref, resp.data as Record<string, unknown>))
      }
    }
    if (ref.market === 'CN' && ref.assetClass === 'ETF') {
      const resp = await handlers.stockQuotes([ref])
      if (resp.success && resp.data && typeof resp.data === 'object') {
        const rows = (resp.data as { quotes?: Record<string, unknown>[] }).quotes ?? []
        const row = rows[0] ?? rows.find(r => String(r.code) === ref.symbol)
        if (row) quotes.push(quoteFromProviderRow(ref, row, 'mixed'))
      }
    }
  }

  if (!quotes.length) return fail('行情获取失败')
  return { success: true, message: `更新 ${quotes.length} 只`, data: { quotes }, elapsed: 0 }
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
  const includeLocal = params.include_local !== false
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
