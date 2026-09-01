/**
 * Shell 隔离模式：Docker-first 默认走 workspace（grant + Deny + env/策略），
 * 不初始化 SRT。`OPPTRIX_SHELL_ISOLATION=srt` 为测试/遗留逃生舱。
 * Agent 沙箱开关见 `OPPTRIX_AGENT_SANDBOX`（Docker 默认 off = 系统级）。
 */

export type OpptrixShellIsolationMode = 'workspace' | 'srt'

/**
 * 解析当前进程的 shell 隔离模式。
 * 默认 `'workspace'`；仅当 `OPPTRIX_SHELL_ISOLATION=srt`（大小写不敏感）时为 `'srt'`。
 */
export function resolveShellIsolationMode(): OpptrixShellIsolationMode {
  const raw = process.env.OPPTRIX_SHELL_ISOLATION?.trim().toLowerCase()
  if (raw === 'srt') return 'srt'
  return 'workspace'
}
