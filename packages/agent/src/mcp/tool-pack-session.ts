import {
  type ToolPackId,
  isToolPackId,
  alwaysOnPackIds,
  toolsInPack,
  TOOL_PACK_DEFS,
  packIdForTool,
} from '@opptrix/shared'
import { resolveToolRoutePlan } from './tool-route-plan.js'
import type { ToolPackResolveInput } from './tool-pack-resolver.js'

/**
 * 会话级已激活工具包 — 同 session 累积，直到会话结束。
 */
export class ToolPackSessionStore {
  private readonly bySession = new Map<string, Set<ToolPackId>>()

  getActivated(sessionId: string): ReadonlySet<ToolPackId> {
    return this.bySession.get(sessionId) ?? new Set()
  }

  activate(sessionId: string, packIds: string[]): { activated: ToolPackId[]; skipped: string[] } {
    const set = this.bySession.get(sessionId) ?? new Set<ToolPackId>()
    const activated: ToolPackId[] = []
    const skipped: string[] = []
    for (const raw of packIds) {
      const id = String(raw ?? '').trim()
      if (!isToolPackId(id)) {
        skipped.push(id || '(empty)')
        continue
      }
      if (alwaysOnPackIds().includes(id)) {
        activated.push(id)
        continue
      }
      set.add(id)
      activated.push(id)
    }
    this.bySession.set(sessionId, set)
    return { activated, skipped }
  }

  clear(sessionId: string) {
    this.bySession.delete(sessionId)
  }
}

/**
 * 合并 always-on + 路由计划播种（首选工具所需 pack ∪ 启发式）+ 会话激活。
 * 路由计划保证「正确工具可见」。
 */
export function resolveActivePackIds(
  store: ToolPackSessionStore,
  sessionId: string,
  input: ToolPackResolveInput,
): ToolPackId[] {
  const plan = resolveToolRoutePlan(input)
  const activated = [...store.getActivated(sessionId)]
  return [...new Set<ToolPackId>([...alwaysOnPackIds(), ...plan.seedPacks, ...activated])]
}

export function toolNamesForPacks(packIds: readonly ToolPackId[]): string[] {
  const names = new Set<string>()
  for (const id of packIds) {
    for (const name of toolsInPack(id)) names.add(name)
  }
  return [...names]
}

export function listToolPacksPayload(activePackIds: readonly ToolPackId[]) {
  const active = new Set(activePackIds)
  return {
    packs: TOOL_PACK_DEFS.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      when_to_use: p.whenToUse,
      always_on: Boolean(p.alwaysOn),
      tool_count: toolsInPack(p.id).length,
      loaded: active.has(p.id),
    })),
    active_packs: [...active],
  }
}

export function unloadedToolHint(toolName: string): string {
  const pack = packIdForTool(toolName)
  if (pack) {
    return `工具 ${toolName} 未加载（属于 pack「${pack}」）。请先调用 activate_tool_pack，参数 pack_ids: ["${pack}"]，再重试。`
  }
  return `未知或不支持的工具：${toolName}。请先 list_tool_packs 查看可用工具包，或改用已加载工具。`
}
