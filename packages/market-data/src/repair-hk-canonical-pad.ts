/**
 * 方案 B 遗留：市场库 HK 全表五位补零（幂等 repair）。
 * flag：`instruments_hk_canonical_pad_v1`（经 sync_cursor）
 */
import type { AssetClass, InstrumentRef } from '@opptrix/shared'
import {
  canonicalHkSymbol,
  normalizeInstrumentRef,
} from '@opptrix/shared'
import { instrumentRefToNs } from './instrument-ns.js'
import { normalizeInstrumentExchange } from './utils.js'

export const INSTRUMENTS_HK_CANONICAL_PAD_V1 = 'instruments_hk_canonical_pad_v1'

export type HkInstrumentRow = {
  market: string
  exchange: string
  code: string
  asset_class: string
  name: string | null
  instrument_ns: string | null
  list_date: string | null
  delist_date: string | null
  status: string | null
  extra: string | null
}

export type HkPadPlanItem =
  | {
    kind: 'rename'
    source: HkInstrumentRow
    toCode: string
    toNs: string
    name: string | null
  }
  | {
    kind: 'merge_drop_source'
    source: HkInstrumentRow
    target: HkInstrumentRow
    /** 写回 target 的 name（保留更完整者） */
    keepName: string | null
  }

function rowKey(row: Pick<HkInstrumentRow, 'market' | 'exchange' | 'code' | 'asset_class'>): string {
  return `${row.market}\0${normalizeInstrumentExchange(row.exchange)}\0${row.code}\0${row.asset_class}`
}

export function nameCompleteness(name: string | null | undefined): number {
  const n = (name ?? '').trim()
  if (!n) return 0
  // 更长且非纯数字视为更完整
  let score = n.length
  if (/[\u4e00-\u9fffA-Za-z]/.test(n)) score += 100
  return score
}

/** `market='HK'` 且 code 为纯数字且与 canonical 不一致（通常 length < 5） */
export function needsHkCanonicalPad(code: string): boolean {
  const raw = code.trim()
  if (!/^\d+$/.test(raw)) return false
  return raw !== canonicalHkSymbol(raw)
}

export function hkCanonicalNs(code: string, exchange: string, assetClass: string): string {
  const ref = normalizeInstrumentRef({
    market: 'HK',
    assetClass: assetClass as AssetClass,
    symbol: canonicalHkSymbol(code),
    exchange: normalizeInstrumentExchange(exchange) || 'HK',
  } as InstrumentRef)
  return instrumentRefToNs(ref)
}

/**
 * 规划补零动作：冲突时保留名称更完整的行，从不静默丢两边。
 */
export function planHkCanonicalPad(rows: HkInstrumentRow[]): HkPadPlanItem[] {
  const hkRows = rows.filter(r => r.market === 'HK')
  const index = new Map<string, HkInstrumentRow>()
  for (const row of hkRows) {
    index.set(rowKey(row), row)
  }

  const plans: HkPadPlanItem[] = []
  const dropKeys = new Set<string>()

  for (const source of hkRows) {
    if (!needsHkCanonicalPad(source.code)) continue
    const srcKey = rowKey(source)
    if (dropKeys.has(srcKey)) continue

    const toCode = canonicalHkSymbol(source.code)
    const exchange = normalizeInstrumentExchange(source.exchange)
    const toNs = hkCanonicalNs(toCode, exchange || 'HK', source.asset_class)
    const targetKey = `${source.market}\0${exchange}\0${toCode}\0${source.asset_class}`
    const target = index.get(targetKey)

    if (!target || targetKey === srcKey) {
      plans.push({
        kind: 'rename',
        source,
        toCode,
        toNs,
        name: source.name,
      })
      dropKeys.add(srcKey)
      continue
    }

    const keepName =
      nameCompleteness(source.name) >= nameCompleteness(target.name)
        ? (source.name?.trim() || target.name)
        : (target.name?.trim() || source.name)

    plans.push({
      kind: 'merge_drop_source',
      source,
      target,
      keepName: keepName ?? null,
    })
    dropKeys.add(srcKey)
  }

  return plans
}
