import type { ResearchResult } from '@opptrix/shared'
import {
  fail,
  instrumentDisplayCode,
  instrumentRefFromParams,
  parseInstrumentRef,
  resolveInstrumentCapabilities,
  type InstrumentRef,
  type UnifiedInstrumentQuote,
} from '@opptrix/shared'

export type InstrumentRouteHandlers = {
  stockDetail: (code: string) => Promise<ResearchResult>
  etfSnapshot: (code: string) => Promise<ResearchResult>
  usSnapshot: (symbol: string) => Promise<ResearchResult>
  regionalSnapshot: (market: 'JP' | 'KR' | 'HK', symbol: string) => Promise<ResearchResult>
  cryptoSnapshot: (pair: string) => Promise<ResearchResult>
  stockQuotes: (codes: string[]) => Promise<ResearchResult>
  usRealtime: (symbol: string) => Promise<ResearchResult>
  regionalRealtime: (market: 'JP' | 'KR' | 'HK', symbol: string) => Promise<ResearchResult>
  cryptoRealtime: (pair: string) => Promise<ResearchResult>
  stockChart: (
    code: string,
    period: string,
    count: number,
    before: string,
    tail: number,
    market?: string,
  ) => Promise<ResearchResult>
  usKline: (symbol: string, count: number) => Promise<ResearchResult>
  regionalKline: (market: 'JP' | 'KR' | 'HK', symbol: string, count: number) => Promise<ResearchResult>
  cryptoKline: (pair: string, count: number) => Promise<ResearchResult>
  searchLocalInstruments: (
    keyword: string,
    limit: number,
    markets?: string[],
  ) => Promise<ResearchResult>
}

function quoteFromCnRow(ref: InstrumentRef, row: Record<string, unknown>): UnifiedInstrumentQuote {
  return {
    instrument: ref,
    code: instrumentDisplayCode(ref),
    name: String(row.name ?? ref.symbol),
    price: row.price != null ? Number(row.price) : null,
    change_pct: row.changePct != null ? Number(row.changePct) : row.change_pct != null ? Number(row.change_pct) : null,
    volume: row.volume != null ? Number(row.volume) : null,
    amount: row.amount != null ? Number(row.amount) : null,
    market: ref.market,
    asset_class: ref.assetClass,
    source: 'live',
  }
}

export async function routeInstrumentSnapshot(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const ref = instrumentRefFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')
  const caps = resolveInstrumentCapabilities(ref)
  if (!caps.capabilities.includes('snapshot')) {
    return fail('该标的类型暂不支持快照')
  }

  if (ref.market === 'CN' && ref.assetClass === 'ETF') {
    return handlers.etfSnapshot(ref.symbol)
  }
  if (ref.market === 'CN') {
    return handlers.stockDetail(ref.symbol)
  }
  if (ref.market === 'US' || ref.market === 'HK') {
    if (ref.market === 'US') return handlers.usSnapshot(ref.symbol)
    return handlers.regionalSnapshot('HK', ref.symbol)
  }
  if (ref.market === 'JP' || ref.market === 'KR') {
    return handlers.regionalSnapshot(ref.market, ref.symbol)
  }
  if (ref.market === 'CRYPTO') {
    return handlers.cryptoSnapshot(instrumentDisplayCode(ref))
  }
  return fail('不支持的市场')
}

export async function routeInstrumentQuotes(
  params: Record<string, unknown>,
  handlers: InstrumentRouteHandlers,
): Promise<ResearchResult> {
  const rawList = params.instruments ?? params.refs
  const refs: InstrumentRef[] = []
  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      const ref = parseInstrumentRef(item)
      if (ref) refs.push(ref)
    }
  }
  if (!refs.length) return fail('instruments 必填')

  const quotes: UnifiedInstrumentQuote[] = []
  const cnCodes = refs.filter(r => r.market === 'CN' && r.assetClass !== 'ETF').map(r => r.symbol)
  if (cnCodes.length) {
    const resp = await handlers.stockQuotes(cnCodes)
    if (resp.success && resp.data && typeof resp.data === 'object') {
      const rows = (resp.data as { quotes?: Record<string, unknown>[] }).quotes ?? []
      for (const row of rows) {
        const code = String(row.code ?? '')
        const ref = refs.find(r => r.market === 'CN' && r.symbol === code)
        if (ref) quotes.push(quoteFromCnRow(ref, row))
      }
    }
  }

  for (const ref of refs) {
    if (ref.market === 'US') {
      const resp = await handlers.usRealtime(ref.symbol)
      if (resp.success && resp.data && typeof resp.data === 'object') {
        quotes.push(quoteFromCnRow(ref, resp.data as Record<string, unknown>))
      }
    }
    if (ref.market === 'HK' || ref.market === 'JP' || ref.market === 'KR') {
      const resp = await handlers.regionalRealtime(ref.market, ref.symbol)
      if (resp.success && resp.data && typeof resp.data === 'object') {
        quotes.push(quoteFromCnRow(ref, resp.data as Record<string, unknown>))
      }
    }
    if (ref.market === 'CRYPTO') {
      const pair = instrumentDisplayCode(ref)
      const resp = await handlers.cryptoRealtime(pair)
      if (resp.success && resp.data && typeof resp.data === 'object') {
        quotes.push(quoteFromCnRow(ref, resp.data as Record<string, unknown>))
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
  const ref = instrumentRefFromParams(params)
  if (!ref) return fail('instrument 必填')
  if (!resolveInstrumentCapabilities(ref).capabilities.includes('chart_daily')) {
    return fail('该标的类型暂不支持图表')
  }

  const period = String(params.period ?? 'daily')
  const count = params.count != null ? Number(params.count) : 120

  if (ref.market === 'CN') {
    return handlers.stockChart(ref.symbol, period, count, '', 0, ref.exchange)
  }
  if (ref.market === 'US') {
    return handlers.usKline(ref.symbol, count)
  }
  if (ref.market === 'HK' || ref.market === 'JP' || ref.market === 'KR') {
    return handlers.regionalKline(ref.market, ref.symbol, count)
  }
  if (ref.market === 'CRYPTO') {
    return handlers.cryptoKline(instrumentDisplayCode(ref), count)
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
  return handlers.searchLocalInstruments(keyword, limit, markets)
}

export function routeInstrumentCapabilities(params: Record<string, unknown>): ResearchResult {
  const ref = instrumentRefFromParams(params)
  if (!ref) return fail('instrument 必填')
  const caps = resolveInstrumentCapabilities(ref)
  return { success: true, message: '标的能力', data: caps, elapsed: 0 }
}
