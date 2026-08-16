/**
 * Self-Harness Phase 2 — route_hint_append → turn-tail 选型卡附录（不改 tools schema）。
 */

import { skillContentHasInjection } from '@opptrix/agent-skills'
import { getActiveHarnessVersionForModel } from './local-store.js'

const ROUTE_HINT_HEADER = '【分析步骤提示】'

/**
 * 从当前模型 active 版本收集 route_hint_append 文本（去重、保序）。
 * 无 active / 无此类 patch → ''
 * 命中注入模式的 text 跳过（defense-in-depth）。
 */
export function buildHarnessRouteHintAppendix(
  modelRef: string | null | undefined,
): string {
  const active = getActiveHarnessVersionForModel(modelRef)
  if (!active?.patches.length) return ''

  const seen = new Set<string>()
  const texts: string[] = []
  for (const p of active.patches) {
    if (p.kind !== 'route_hint_append') continue
    const text = typeof p.text === 'string' ? p.text.trim() : ''
    if (!text || seen.has(text)) continue
    if (skillContentHasInjection(text)) continue
    seen.add(text)
    texts.push(text)
  }
  if (!texts.length) return ''
  return [ROUTE_HINT_HEADER, ...texts.map(t => `- ${t}`)].join('\n')
}

/**
 * 将 appendix 拼到选型卡字符串末尾（不改 buildRoundRoutePlaybook 的 tools 语义）。
 * appendix 空 → 原样返回 playbook。
 */
export function appendHarnessRouteHintToPlaybook(
  playbook: string,
  appendix: string,
): string {
  const hint = appendix.trim()
  if (!hint) return playbook
  const base = playbook.trimEnd()
  if (!base) return hint
  return `${base}\n\n${hint}`
}
