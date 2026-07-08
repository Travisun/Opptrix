import type { ResearchResult } from '@opptrix/shared'
import {
  fail,
  hasApplicationCapability,
  parseInstrumentRef,
  type InstrumentRef,
  type UnifiedInstrumentBatchResult,
  type UnifiedInstrumentQuote,
} from '@opptrix/shared'

export type InstrumentBatchRouteHandlers = {
  cnBatchSnapshots: (symbols: string[]) => Promise<ResearchResult>
  batchQuotesOrSnapshots?: (refs: InstrumentRef[]) => Promise<ResearchResult>
}

function parseInstrumentList(params: Record<string, unknown>): InstrumentRef[] {
  const refs: InstrumentRef[] = []
  const rawList = params.instruments ?? params.refs
  if (!Array.isArray(rawList)) return refs
  for (const item of rawList) {
    const ref = parseInstrumentRef(item)
    if (ref) refs.push(ref)
  }
  return refs
}

function quotesFromResult(data: Record<string, unknown> | undefined): UnifiedInstrumentQuote[] {
  if (!data?.quotes || !Array.isArray(data.quotes)) return []
  return data.quotes as UnifiedInstrumentQuote[]
}

function mergeBatchResults(results: ResearchResult[]): ResearchResult {
  const failed = results.find(r => !r.success)
  if (failed) return failed

  const payload: UnifiedInstrumentBatchResult = {
    trade_date: null,
    count: 0,
    quotes: [],
    discover_items: [],
    items: [],
  }

  for (const r of results) {
    const data = r.data as Record<string, unknown> | undefined
    if (!data) continue
    if (data.trade_date != null) payload.trade_date = String(data.trade_date)
    const batchItems = batchRowsFromData(data)
    if (batchItems.length) {
      payload.discover_items!.push(...batchItems)
      payload.items = [...(payload.items ?? []), ...batchItems]
    }
    payload.quotes.push(...quotesFromResult(data))
  }

  payload.count = payload.quotes.length + (payload.discover_items?.length ?? 0)
  if (!payload.discover_items?.length) {
    delete payload.discover_items
    delete payload.items
  }

  return {
    success: true,
    message: `批量快照 ${payload.count} 只`,
    data: payload,
    elapsed: Math.max(...results.map(r => r.elapsed ?? 0)),
  }
}

function batchRowsFromData(data: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(data.discover_items)) return data.discover_items as Record<string, unknown>[]
  if (Array.isArray(data.items)) return data.items as Record<string, unknown>[]
  return []
}

/** Legacy CN-only batch — 仍返回 discover_items，外层统一 envelope */
export function wrapCnBatchResult(resp: ResearchResult): ResearchResult {
  if (!resp.success || !resp.data || typeof resp.data !== 'object') return resp
  const data = resp.data as Record<string, unknown>
  const items = Array.isArray(data.items) ? data.items as Record<string, unknown>[] : []
  const payload: UnifiedInstrumentBatchResult = {
    trade_date: data.trade_date != null ? String(data.trade_date) : null,
    count: items.length,
    quotes: [],
    discover_items: items,
    items,
  }
  return { ...resp, data: payload }
}

export async function routeInstrumentBatchSnapshots(
  params: Record<string, unknown>,
  handlers: InstrumentBatchRouteHandlers,
): Promise<ResearchResult> {
  const legacyCodesOnly =
    Array.isArray(params.codes)
    && !Array.isArray(params.instruments)
    && !Array.isArray(params.refs)

  if (legacyCodesOnly) {
    const symbols = (params.codes as string[]).map(String).filter(Boolean)
    if (!symbols.length) return fail('codes 必填')
    return wrapCnBatchResult(await handlers.cnBatchSnapshots(symbols))
  }

  const refs = parseInstrumentList(params)
  if (!refs.length) return fail('instruments 或 codes 必填')

  const cnEquitySymbols = refs
    .filter(r => r.market === 'CN' && r.assetClass === 'EQUITY')
    .map(r => r.symbol)

  const otherSnapshotRefs = refs.filter(
    r => !(r.market === 'CN' && r.assetClass === 'EQUITY')
      && (hasApplicationCapability(r, 'snapshot') || hasApplicationCapability(r, 'batch_quote')),
  )

  if (!cnEquitySymbols.length && !otherSnapshotRefs.length) {
    return fail('无支持批量快照的标的')
  }

  const results: ResearchResult[] = []

  if (cnEquitySymbols.length) {
    results.push(wrapCnBatchResult(await handlers.cnBatchSnapshots(cnEquitySymbols)))
  }

  if (otherSnapshotRefs.length) {
    if (!handlers.batchQuotesOrSnapshots) {
      return fail('该批标的含非 A 股权益类，暂无批量快照')
    }
    results.push(await handlers.batchQuotesOrSnapshots(otherSnapshotRefs))
  }

  if (results.length === 1) return results[0]!
  return mergeBatchResults(results)
}
