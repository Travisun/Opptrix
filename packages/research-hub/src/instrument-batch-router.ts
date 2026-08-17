import type { ResearchResult } from '@opptrix/shared'
import {
  fail,
  hasApplicationCapability,
  parseInstrumentRef,
  type InstrumentRef,
  type UnifiedInstrumentBatchFailure,
  type UnifiedInstrumentBatchResult,
  type UnifiedInstrumentQuote,
} from '@opptrix/shared'

/**
 * Hub CN 批量快照硬上限。
 * HostnameRateLimiter 全局 maxQueued（512）须 ≥ 本值，以便同 host 全开并发时排队而不必同 host 多在途。
 */
export const BATCH_INSTRUMENT_SNAPSHOTS_MAX = 200

export type InstrumentBatchRouteHandlers = {
  cnBatchSnapshots: (symbols: string[]) => Promise<ResearchResult>
  batchQuotesOrSnapshots?: (refs: InstrumentRef[]) => Promise<ResearchResult>
}

export type BatchSnapshotFetchResult = {
  success: boolean
  data?: Record<string, unknown>
  message?: string
}

/**
 * Hub 批内全开并发拉取；成功 items 保持输入相对顺序；失败另列 failed[]。
 * 不在此层限流 — 免费源仍靠 HostnameRateLimiter（每 host 单在途 + 间隔）。
 */
export async function collectParallelCnBatchItems(
  codes: string[],
  fetchOne: (code: string) => Promise<BatchSnapshotFetchResult>,
  max = BATCH_INSTRUMENT_SNAPSHOTS_MAX,
): Promise<{
  items: Record<string, unknown>[]
  failed: UnifiedInstrumentBatchFailure[]
  requested_count: number
  attempted_count: number
}> {
  const requested_count = codes.length
  const slice = codes.slice(0, max)
  const attempted_count = slice.length

  const settled = await Promise.all(
    slice.map(async (code) => {
      try {
        const snap = await fetchOne(code)
        if (snap.success && snap.data && typeof snap.data === 'object') {
          return { ok: true as const, data: snap.data }
        }
        return {
          ok: false as const,
          code,
          reason: (snap.message && String(snap.message).trim()) || '快照不可用',
        }
      } catch (e) {
        return {
          ok: false as const,
          code,
          reason: e instanceof Error ? e.message : String(e),
        }
      }
    }),
  )

  const items: Record<string, unknown>[] = []
  const failed: UnifiedInstrumentBatchFailure[] = []
  for (const r of settled) {
    if (r.ok) items.push(r.data)
    else failed.push({ code: r.code, reason: r.reason })
  }
  return { items, failed, requested_count, attempted_count }
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

function asFailureList(raw: unknown): UnifiedInstrumentBatchFailure[] {
  if (!Array.isArray(raw)) return []
  const out: UnifiedInstrumentBatchFailure[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const reason = row.reason != null ? String(row.reason) : ''
    if (!reason) continue
    const entry: UnifiedInstrumentBatchFailure = { reason }
    if (row.code != null && String(row.code)) entry.code = String(row.code)
    if (row.symbol != null && String(row.symbol)) entry.symbol = String(row.symbol)
    out.push(entry)
  }
  return out
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
    requested_count: 0,
    attempted_count: 0,
    failed: [],
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
    if (typeof data.requested_count === 'number' && Number.isFinite(data.requested_count)) {
      payload.requested_count = (payload.requested_count ?? 0) + data.requested_count
    }
    if (typeof data.attempted_count === 'number' && Number.isFinite(data.attempted_count)) {
      payload.attempted_count = (payload.attempted_count ?? 0) + data.attempted_count
    }
    payload.failed!.push(...asFailureList(data.failed))
  }

  payload.count = payload.quotes.length + (payload.discover_items?.length ?? 0)
  if (!payload.discover_items?.length) {
    delete payload.discover_items
    delete payload.items
  }
  if (!payload.failed?.length) delete payload.failed
  if (payload.requested_count === 0 && payload.attempted_count === 0) {
    delete payload.requested_count
    delete payload.attempted_count
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
  if (typeof data.requested_count === 'number' && Number.isFinite(data.requested_count)) {
    payload.requested_count = data.requested_count
  }
  if (typeof data.attempted_count === 'number' && Number.isFinite(data.attempted_count)) {
    payload.attempted_count = data.attempted_count
  }
  const failed = asFailureList(data.failed)
  if (failed.length) payload.failed = failed
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

  if (results.length === 1) {
    const only = results[0]
    if (only) return only
  }
  return mergeBatchResults(results)
}
