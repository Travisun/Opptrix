import type { ResearchResult } from '@opptrix/shared'
import {
  fail,
  hasApplicationCapability,
  parseInstrumentRef,
  type InstrumentRef,
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

function mergeBatchResults(results: ResearchResult[]): ResearchResult {
  const failed = results.find(r => !r.success)
  if (failed) return failed

  const items: unknown[] = []
  const quotes: unknown[] = []
  let tradeDate: string | null = null
  for (const r of results) {
    const data = r.data as Record<string, unknown> | undefined
    if (data?.items && Array.isArray(data.items)) items.push(...data.items)
    if (data?.quotes && Array.isArray(data.quotes)) quotes.push(...data.quotes)
    if (data?.trade_date != null) tradeDate = String(data.trade_date)
  }

  const count = items.length || quotes.length
  return {
    success: true,
    message: `批量快照 ${count} 只`,
    data: {
      trade_date: tradeDate,
      ...(items.length ? { items } : {}),
      ...(quotes.length ? { quotes } : {}),
    },
    elapsed: Math.max(...results.map(r => r.elapsed ?? 0)),
  }
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
    return handlers.cnBatchSnapshots(symbols)
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
    results.push(await handlers.cnBatchSnapshots(cnEquitySymbols))
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
