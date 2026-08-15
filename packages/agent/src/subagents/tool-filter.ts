/**
 * 子 Agent 工具过滤：同权但禁止嵌套委派与人机确认类入口。
 */

/** 委派类 — 子不可再委派 */
export const SUBAGENT_DELEGATION_TOOL_NAMES = Object.freeze([
  'run_subagent',
  'list_subagents',
  'cancel_subagent',
  'get_subagent',
  'reclaim_subagent',
] as const)

/** 人机确认 / 授权入口 — 子缺权，须经父 */
export const SUBAGENT_CONFIRM_TOOL_NAMES = Object.freeze([
  'ask_user',
  'request_secret',
  'request_session_lan_access',
  'grant_session_secret',
] as const)

export const SUBAGENT_BLOCKED_TOOL_NAMES = Object.freeze([
  ...SUBAGENT_DELEGATION_TOOL_NAMES,
  ...SUBAGENT_CONFIRM_TOOL_NAMES,
] as const)

const BLOCKED = new Set<string>(SUBAGENT_BLOCKED_TOOL_NAMES)

export function isSubagentBlockedTool(name: string): boolean {
  return BLOCKED.has(name.trim())
}

export function filterToolNamesForSubagent(names: readonly string[]): string[] {
  return names.filter(n => !BLOCKED.has(n))
}

/** OpenAI tools / ToolDef 形过滤 */
export function filterToolsForSubagent<T extends { name?: string; function?: { name?: string } }>(
  tools: readonly T[],
): T[] {
  return tools.filter(t => {
    const name = t.function?.name ?? t.name
    return typeof name !== 'string' || !BLOCKED.has(name)
  })
}

export function subagentBlockedToolError(toolName: string): {
  ok: false
  error: string
  needs_parent_action: {
    kind: 'confirm' | 'secret' | 'lan' | 'other'
    message: string
  }
} {
  const name = toolName.trim()
  let kind: 'confirm' | 'secret' | 'lan' | 'other' = 'other'
  if (name === 'ask_user') kind = 'confirm'
  else if (name === 'request_secret' || name === 'grant_session_secret') kind = 'secret'
  else if (name === 'request_session_lan_access') kind = 'lan'
  else if (SUBAGENT_DELEGATION_TOOL_NAMES.includes(name as typeof SUBAGENT_DELEGATION_TOOL_NAMES[number])) {
    return {
      ok: false,
      error: '子任务不能再委派',
      needs_parent_action: {
        kind: 'other',
        message: '子任务不能再委派；请由父会话处理',
      },
    }
  }
  return {
    ok: false,
    error: `子任务无权调用 ${name}；请交由父会话确认或授权`,
    needs_parent_action: {
      kind,
      message: `子任务需要父会话处理：${name}`,
    },
  }
}
