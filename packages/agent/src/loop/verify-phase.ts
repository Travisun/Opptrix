import type { ResearchTier } from '@opptrix/shared'
import type { LlmToolChoice } from '../llm/provider.js'
import { hasPendingChecklistItems, isChecklistAllDone } from './research-checklist.js'

export type LoopPhase = 'gather' | 'verify'

export const VERIFY_TURN_TAIL =
  '请核对结论中的关键数字与事实是否均来自本轮工具结果；缺证据则说明缺口；不要编造。'

/**
 * 与 `buildRoundSystemPrompt` 一致：专家默认档位优先于路由档位。
 * 避免「专家 L3 + 路由 L1」时 system 按 L3 写、verify 却跳过。
 */
export function resolveEffectiveResearchTier(
  expertDefaultTier: ResearchTier | string | null | undefined,
  planTier: ResearchTier | string | null | undefined,
): ResearchTier | undefined {
  const raw = expertDefaultTier ?? planTier
  if (raw === 'L1' || raw === 'L2' || raw === 'L3') return raw
  return undefined
}

export function shouldEnterVerifyPhase(opts: {
  researchTier: ResearchTier | string | undefined
  hasActivatedSkill: boolean
  businessToolsUsed: number
  alreadyVerified: boolean
  unattended?: boolean
}): boolean {
  if (opts.alreadyVerified) return false
  if (opts.businessToolsUsed < 1) return false
  const tier = opts.researchTier
  const deep = tier === 'L3' || opts.hasActivatedSkill
  if (!deep) return false
  // unattended：可轻量做 verify
  return true
}

/** 业务工具：排除交互/元工具，避免误触发 verify */
const NON_BUSINESS_TOOLS = new Set([
  'ask_user',
  'update_research_checklist',
  'list_tool_packs',
  'activate_tool_pack',
  'list_agent_skills',
  'activate_agent_skill',
  'get_agent_skill',
  'get_agent_skill_file',
  'create_agent_skill',
  'import_agent_skill',
  'delete_agent_skill',
  'list_mcp_servers',
  'enable_mcp_server',
  'disable_mcp_server',
  'edit_mcp_server',
  'install_mcp_server',
  'uninstall_mcp_server',
  'reorder_mcp_servers',
  'request_secret',
  'grant_session_secret',
])

export function isBusinessToolName(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (NON_BUSINESS_TOOLS.has(n)) return false
  return true
}

/**
 * gather 默认 auto；checklist 全 done 后倾向 none（若模型仍调工具则下一轮允许再 auto 一次由调用方处理）。
 */
export function resolveGatherToolChoice(sessionId: string, opts?: {
  preferNoneAfterChecklistDone?: boolean
  checklistNoneAlreadyTried?: boolean
}): LlmToolChoice {
  if (
    opts?.preferNoneAfterChecklistDone
    && isChecklistAllDone(sessionId)
    && !hasPendingChecklistItems(sessionId)
    && !opts.checklistNoneAlreadyTried
  ) {
    return 'none'
  }
  return 'auto'
}

export function resolveVerifyToolChoice(): LlmToolChoice {
  return 'none'
}
