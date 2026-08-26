/**
 * OpptrixQuant 标的详情解析 — GET /api/v1/instruments/{id}
 * 用于补全名称等元数据；禁止用 instrument_search 逐条关键词检索。
 */

import type { InstrumentRef } from '@opptrix/shared'
import { buildOpptrixInstrumentId, instrumentRefKey, normalizeInstrumentRef } from '@opptrix/shared'
import { opptrixGetInstrument } from '../providers/stockindex/api/client.js'
import { StockIndexHttpClient } from '../providers/stockindex/api/http-client.js'

const RESOLVE_NAME_CONCURRENCY = 5

export interface InstrumentNameResolveHit {
  instrument: InstrumentRef
  name: string | null
}

function displayNameFromOpptrixInstrument(
  inst: NonNullable<Awaited<ReturnType<typeof opptrixGetInstrument>>>,
): string | null {
  const cn = String(inst.name ?? '').trim()
  if (cn) return cn
  const en = String(inst.name_en ?? '').trim()
  return en || null
}

/** 按 Opptrix ID 批量解析标的名称（有界并发；无 Key 时返回空） */
export async function resolveInstrumentNamesViaStockIndex(
  refs: InstrumentRef[],
): Promise<InstrumentNameResolveHit[]> {
  if (!StockIndexHttpClient.fromConfig()) return []

  const unique = [
    ...new Map(
      refs.map(r => {
        const instrument = normalizeInstrumentRef(r)
        return [instrumentRefKey(instrument), instrument] as const
      }),
    ).values(),
  ]

  const out: InstrumentNameResolveHit[] = []

  for (let i = 0; i < unique.length; i += RESOLVE_NAME_CONCURRENCY) {
    const chunk = unique.slice(i, i + RESOLVE_NAME_CONCURRENCY)
    const batch = await Promise.all(chunk.map(async (instrument): Promise<InstrumentNameResolveHit> => {
      try {
        const id = buildOpptrixInstrumentId(instrument)
        const inst = await opptrixGetInstrument(id)
        if (!inst) return { instrument, name: null }
        return { instrument, name: displayNameFromOpptrixInstrument(inst) }
      } catch {
        return { instrument, name: null }
      }
    }))
    out.push(...batch)
  }

  return out
}
