/**
 * 持久化标题写入前的人性化（含 OpptrixQuant 批量补名）。
 */
import type { InstrumentRef } from '@opptrix/shared'
import {
  collectInstrumentRefsForTitle,
  humanizeChatTitle,
  type ChatTitleNameLookup,
} from '@opptrix/shared/chat-title-display'
import { buildOpptrixInstrumentId } from '@opptrix/shared/instrument-symbol'
import { instrumentDisplayCode, instrumentRefKey } from '@opptrix/shared/instrument-ref'

function applyNameHits(
  lookup: Map<string, string>,
  hits: Array<{ instrument: InstrumentRef; name: string | null }>,
): void {
  for (const hit of hits) {
    const name = hit.name?.trim()
    if (!name) continue
    lookup.set(instrumentRefKey(hit.instrument), name)
    lookup.set(buildOpptrixInstrumentId(hit.instrument), name)
    lookup.set(instrumentDisplayCode(hit.instrument), name)
    lookup.set(hit.instrument.symbol, name)
  }
}

/** 同步格式化（仅技能 / 已有 lookup / 名称括号） */
export function formatChatTitleSync(
  raw: string,
  lookup?: ChatTitleNameLookup,
  maxLen = 48,
): string {
  return humanizeChatTitle(raw, lookup, maxLen)
}

/** 异步格式化：缺失名称时经 OpptrixQuant 批量补全后再写入 */
export async function formatChatTitle(
  raw: string,
  maxLen = 48,
  lookupSeed?: ChatTitleNameLookup,
): Promise<string> {
  const lookup = new Map(lookupSeed ?? [])
  const refs = collectInstrumentRefsForTitle(raw, lookup)
  if (refs.length) {
    try {
      const { resolveInstrumentNamesViaStockIndex } = await import('@opptrix/a-stock-layer')
      const hits = await resolveInstrumentNamesViaStockIndex(refs)
      applyNameHits(lookup, hits)
    } catch {
      // 补名失败仍走同步人性化（技能 / 括号名称等）
    }
  }
  return humanizeChatTitle(raw, lookup, maxLen)
}
