import { parseNamespacedMcpTool } from '@opptrix/shared'

/**
 * 必须串行的工具（人机确认 / 写删 / shell / secret / 调度变更 / activate·MCP / browser 会话态）。
 * 外部命名空间 MCP（serverId__tool）默认串行。
 */
export const SERIAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  // 人机
  'ask_user',
  // Workspace 写/删/侧效
  'workspace_write',
  'workspace_mkdir',
  'workspace_delete',
  'download_file',
  'request_folder_access',
  // Shell
  'opptrix_run',
  'shell_run',
  'shell_install',
  'request_shell_network',
  'ensure_python',
  // Secret
  'request_secret',
  'grant_session_secret',
  // Schedule 变更/执行
  'create_scheduled_job',
  'update_scheduled_job',
  'enable_scheduled_job',
  'disable_scheduled_job',
  'delete_scheduled_job',
  'run_scheduled_job_now',
  // Activate / MCP 变更
  'activate_tool_pack',
  'activate_agent_skill',
  'enable_mcp_server',
  'disable_mcp_server',
  'edit_mcp_server',
  'install_mcp_server',
  'uninstall_mcp_server',
  'reorder_mcp_servers',
  // 会话 checklist 写（避免并行竞态）
  'update_research_checklist',
  // Browser 写/会话态（含截图：共享 Playwright session）
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_close',
  'browser_screenshot',
])

export function isSerialTool(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (SERIAL_TOOL_NAMES.has(trimmed)) return true
  if (parseNamespacedMcpTool(trimmed)) return true
  return false
}

export type ToolCallLike = {
  id: string
  function: { name: string; arguments?: string }
}

export type ToolExecutionBatch<T extends ToolCallLike = ToolCallLike> =
  | { mode: 'parallel'; calls: T[] }
  | { mode: 'serial'; calls: T[] }

/**
 * 只读片段可并行：连续非串行工具合成 parallel batch；遇串行则单独 serial batch（保持相对顺序）。
 */
export function partitionToolCallsForExecution<T extends ToolCallLike>(
  calls: readonly T[],
): ToolExecutionBatch<T>[] {
  const batches: ToolExecutionBatch<T>[] = []
  let pendingParallel: T[] = []

  const flushParallel = () => {
    if (!pendingParallel.length) return
    batches.push({ mode: 'parallel', calls: pendingParallel })
    pendingParallel = []
  }

  for (const call of calls) {
    if (isSerialTool(call.function.name)) {
      flushParallel()
      batches.push({ mode: 'serial', calls: [call] })
    } else {
      pendingParallel.push(call)
    }
  }
  flushParallel()
  return batches
}
