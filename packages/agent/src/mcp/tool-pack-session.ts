import {
  type ToolPackId,
  isToolPackId,
  alwaysOnPackIds,
  toolsInPack,
  TOOL_PACK_DEFS,
  packIdForTool,
} from '@opptrix/shared'
import { TOOL_META } from '../tool-meta.js'
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
    return `工具 ${toolName} 不在本会话冻结的 tools 列表中（映射 pack「${pack}」）。会话启动时已全量加载工具包；请核对本轮 tools 参数与选型卡首选工具，勿重复 activate_tool_pack。`
  }
  // 运行时 shared 与 agent TOOL_META 偶发不同步时，勿误导去 workspace 沙盒兜底
  if (Object.prototype.hasOwnProperty.call(TOOL_META, toolName)) {
    return `工具 ${toolName} 已注册但未挂入可用 pack 映射（常见于 artifacts 等）。本会话 tools 已冻结；请核对 tools 列表是否含该工具，或更新应用后再试；勿改走 workspace 沙盒虚构实现。`
  }
  return `未知或不支持的工具：${toolName}。请 list_tool_packs 核对；若无对应工具 → 用 opptrix_run / workspace_* 沙盒编程实现（ensure_python 仅失败兜底），勿虚构工具名。`
}
