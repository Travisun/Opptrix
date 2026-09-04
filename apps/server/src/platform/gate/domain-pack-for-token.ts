import { packIdForTool, type ToolPackId } from '@opptrix/shared'
import type { DomainPackId } from '../packs/types.js'

/** Tool packs that map to the research domain pack. */
const RESEARCH_TOOL_PACKS: ReadonlySet<ToolPackId> = new Set([
  'instrument_analytics',
  'fundamentals',
  'market',
  'etf',
  'portfolio',
  'industry',
  'news',
  'strategy_extra',
  'provider_ext',
])

/** Tool packs that map to the coding domain pack. */
const CODING_TOOL_PACKS: ReadonlySet<ToolPackId> = new Set(['browser', 'workspace'])

/**
 * Resolve which domain pack (if any) gates a capability token.
 *
 * - `data.*` → research
 * - `code.*` / `hands.*` → coding
 * - known tool names → research|coding via tool-pack membership
 * - core / meta / automation / artifacts / unknown → null (not gated)
 */
export function domainPackForToken(token: string): DomainPackId | null {
  const t = String(token ?? '').trim()
  if (!t) return null

  if (t.startsWith('data.')) return 'research'
  if (t.startsWith('code.') || t.startsWith('hands.')) return 'coding'

  const toolPack = packIdForTool(t)
  if (!toolPack) return null
  if (RESEARCH_TOOL_PACKS.has(toolPack)) return 'research'
  if (CODING_TOOL_PACKS.has(toolPack)) return 'coding'
  return null
}
