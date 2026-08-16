/**
 * 会话级冻结 tools — DSH 前缀缓存：首次 chat 全量 pack + 稳定排序，mid-loop 不再变集/变序。
 */

import { allToolPackIds, businessPackIds, type ToolPackId } from '@opptrix/shared'
import type { OpenAiTool } from '../tools.js'
import { orderToolsByPreference } from './tool-route-plan.js'
import { toolNamesForPacks } from './tool-pack-session.js'
import {
  filterOpenAiToolsForUnattended,
  filterToolNamesForUnattended,
} from '../unattended.js'
import {
  filterToolNamesForSubagent,
  filterToolsForSubagent,
} from '../subagents/tool-filter.js'

export interface SessionFrozenToolsEntry {
  openAiTools: OpenAiTool[]
  activeNames: readonly string[]
  /** JSON.stringify(openAiTools) — 同会话字节相等校验 */
  toolsJson: string
  schemaGeneration: number
}

/** 稳定排序：remoteFirst + 名字典序；禁止 preferred 重排 */
export function orderToolsStable<T extends { function?: { name?: string }; name?: string }>(
  tools: readonly T[],
): T[] {
  return orderToolsByPreference([...tools], [], { remoteFirst: true })
}

export function resolveFullSessionPackIds(): ToolPackId[] {
  return allToolPackIds()
}

export function resolveFullSessionToolNames(): string[] {
  return toolNamesForPacks(resolveFullSessionPackIds())
}

export function filterFrozenToolsForSubagent(entry: SessionFrozenToolsEntry): SessionFrozenToolsEntry {
  const activeNames = filterToolNamesForSubagent([...entry.activeNames])
  const openAiTools = filterToolsForSubagent(entry.openAiTools) as OpenAiTool[]
  return {
    openAiTools,
    activeNames,
    toolsJson: JSON.stringify(openAiTools),
    schemaGeneration: entry.schemaGeneration,
  }
}

export function filterFrozenToolsForUnattended(entry: SessionFrozenToolsEntry): SessionFrozenToolsEntry {
  const activeNames = filterToolNamesForUnattended([...entry.activeNames])
  const openAiTools = filterOpenAiToolsForUnattended([...entry.openAiTools])
  return {
    openAiTools,
    activeNames,
    toolsJson: JSON.stringify(openAiTools),
    schemaGeneration: entry.schemaGeneration,
  }
}

export function businessPackIdsForSessionSeed(): ToolPackId[] {
  return businessPackIds()
}
