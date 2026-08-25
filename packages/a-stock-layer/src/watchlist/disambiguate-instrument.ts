/**
 * 方案 B 遗留：关注列表未消歧项 — 唯一命中自动写回；多命中返回候选供用户点选；
 * 零命中保持空 instrument，由 UI 提示重新搜索选定。
 */
import type { InstrumentRef } from '@opptrix/shared'
import {
  buildInstrumentNamespace,
  canonicalHkSymbol,
  isAmbiguousNumericCode,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  instrumentRefKey,
} from '@opptrix/shared'
import type { WatchlistItem } from './models.js'
import { normalizeWatchlistItem } from './instrument.js'

/** user-store meta — 本地唯一消歧启动迁移已跑过一轮 */
export const INSTRUMENT_ID_UNIFY_WATCHLIST_V2 = 'instrument_id_unify_watchlist_v2'

export type DisambiguationHit = {
  instrument: InstrumentRef
  name?: string | null
}

/** 多命中候选 — 含 namespace code，供 UI 点选写回 */
export type DisambiguationCandidate = {
  instrument: InstrumentRef
  name: string | null
  code: string
}

export type DisambiguateOutcome =
  | { status: 'resolved'; item: WatchlistItem }
  | { status: 'ambiguous'; item: WatchlistItem; candidates: DisambiguationCandidate[] }
  | { status: 'unresolved'; item: WatchlistItem }

export function stripDigitBare(symbol: string): string {
  const digits = symbol.replace(/\D/g, '')
  const stripped = digits.replace(/^0+/, '')
  return stripped || '0'
}

/** 仍缺可靠 InstrumentRef、且 code 像 1–5 位歧义裸数字（或历史脏项） */
export function watchlistItemNeedsDisambiguation(item: WatchlistItem): boolean {
  if (item.instrument?.market && item.instrument.symbol) {
    if (String(item.instrument.exchange ?? '').toUpperCase() === 'PENDING') return true
    return false
  }
  const code = String(item.code ?? '').trim()
  if (!code) return false
  if (parseCanonicalInstrumentInput(code)) return false
  if (isAmbiguousNumericCode(code)) return true
  const digits = code.replace(/\D/g, '')
  return /^\d{1,5}$/.test(digits)
}

/** 命中与查询码「去前导零后数字」一致（700 ≡ 00700 ≡ 000700） */
export function filterExactDigitHits<T extends DisambiguationHit>(
  hits: T[],
  queryCode: string,
): T[] {
  const want = stripDigitBare(queryCode)
  if (!/^\d+$/.test(want) && want !== '0') return []
  return hits.filter(h => stripDigitBare(h.instrument.symbol) === want)
}

/** 恰好一条跨市场（或同市场）唯一命中才返回；否则 null（禁止瞎猜） */
export function pickUniqueInstrumentRef(hits: DisambiguationHit[]): InstrumentRef | null {
  const deduped = new Map<string, InstrumentRef>()
  for (const hit of hits) {
    if (!hit.instrument?.market || !hit.instrument.symbol) continue
    const ref = normalizeInstrumentRef(hit.instrument)
    deduped.set(instrumentRefKey(ref), ref)
  }
  if (deduped.size !== 1) return null
  const only = deduped.values().next().value
  return only ?? null
}

/**
 * 去重后的消歧候选列表（含 namespace code / name / market）。
 * 0 或 1 条时仍返回数组，由调用方决定是否视为 ambiguous。
 */
export function listDisambiguationCandidates(
  hits: DisambiguationHit[],
): DisambiguationCandidate[] {
  const deduped = new Map<string, DisambiguationCandidate>()
  for (const hit of hits) {
    if (!hit.instrument?.market || !hit.instrument.symbol) continue
    const instrument = normalizeInstrumentRef(hit.instrument)
    const key = instrumentRefKey(instrument)
    if (deduped.has(key)) continue
    const name = hit.name?.trim() || null
    deduped.set(key, {
      instrument,
      name,
      code: buildInstrumentNamespace(instrument),
    })
  }
  return [...deduped.values()]
}

export function applyResolvedInstrument(
  item: WatchlistItem,
  ref: InstrumentRef,
  preferredName?: string | null,
): WatchlistItem {
  const normalized = normalizeInstrumentRef(ref)
  const ns = buildInstrumentNamespace(normalized)
  return normalizeWatchlistItem({
    ...item,
    code: ns,
    name: item.name?.trim() || preferredName?.trim() || ns,
    instrument: normalized,
  })
}

/**
 * 用命中消歧单条，返回完备 outcome（唯一 → resolved；多 → ambiguous；零 → unresolved）。
 */
export function disambiguateWatchlistItemOutcome(
  item: WatchlistItem,
  hits: DisambiguationHit[],
): DisambiguateOutcome {
  if (!watchlistItemNeedsDisambiguation(item)) {
    return { status: 'resolved', item }
  }
  const code = String(item.code ?? '').trim()
  const filtered = filterExactDigitHits(hits, code)
  const candidates = listDisambiguationCandidates(filtered)
  if (candidates.length === 1) {
    const only = candidates[0]
    return {
      status: 'resolved',
      item: applyResolvedInstrument(item, only.instrument, only.name),
    }
  }
  if (candidates.length > 1) {
    return { status: 'ambiguous', item, candidates }
  }
  return { status: 'unresolved', item }
}

/**
 * 用本地命中消歧单条；仅唯一写回，多/零命中原样返回（不写假 CN/JP）。
 * 需要候选列表时请用 {@link disambiguateWatchlistItemOutcome}。
 */
export function disambiguateWatchlistItemFromHits(
  item: WatchlistItem,
  hits: DisambiguationHit[],
): WatchlistItem {
  const outcome = disambiguateWatchlistItemOutcome(item, hits)
  return outcome.status === 'resolved' ? outcome.item : outcome.item
}

export type LocalLookup = (keyword: string) => DisambiguationHit[]

function collectLocalHits(item: WatchlistItem, lookup: LocalLookup): DisambiguationHit[] {
  const code = String(item.code ?? '').trim()
  const digits = code.replace(/\D/g, '')
  const keywords = new Set<string>([code])
  if (/^\d{1,5}$/.test(digits)) {
    keywords.add(canonicalHkSymbol(digits))
    if (digits.length <= 6) keywords.add(digits.padStart(6, '0'))
  }
  const hits: DisambiguationHit[] = []
  const seen = new Set<string>()
  for (const kw of keywords) {
    for (const hit of lookup(kw)) {
      const key = instrumentRefKey(normalizeInstrumentRef(hit.instrument))
      if (seen.has(key)) continue
      seen.add(key)
      hits.push(hit)
    }
  }
  return hits
}

/**
 * 批量本地消歧（同步、幂等）。lookup 由调用方注入 searchLocalInstruments。
 * 多命中不静默丢弃：写入 candidatesByCode（key = 原 item.code）。
 */
export function disambiguateWatchlistItemsLocal(
  items: WatchlistItem[],
  lookup: LocalLookup,
): {
  items: WatchlistItem[]
  resolved: number
  candidatesByCode: Record<string, DisambiguationCandidate[]>
} {
  let resolved = 0
  const candidatesByCode: Record<string, DisambiguationCandidate[]> = {}
  const out = items.map(item => {
    if (!watchlistItemNeedsDisambiguation(item)) return item
    const code = String(item.code ?? '').trim()
    const hits = collectLocalHits(item, lookup)
    const outcome = disambiguateWatchlistItemOutcome(item, hits)
    if (outcome.status === 'resolved') {
      if (watchlistItemNeedsDisambiguation(item)) resolved++
      return outcome.item
    }
    if (outcome.status === 'ambiguous') {
      candidatesByCode[code] = outcome.candidates
    }
    return outcome.item
  })
  return { items: out, resolved, candidatesByCode }
}

/** 在线补强：仅当唯一命中时写回；多命中可经 outcome 取 candidates */
export function disambiguateWatchlistItemFromOnlineHits(
  item: WatchlistItem,
  onlineHits: DisambiguationHit[],
): WatchlistItem {
  return disambiguateWatchlistItemFromHits(item, onlineHits)
}
