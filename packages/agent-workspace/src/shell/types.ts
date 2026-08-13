import type { Platform } from '@anthropic-ai/sandbox-runtime'

export type ShellNetworkIntent = 'none' | 'install'

/** opptrix_run 引用保险箱条目 — 仅传名字；host 注入 sentinel，明文不进子进程 env */
export interface ShellSecretRef {
  name: string
  /** 注入到子进程的环境变量名，默认与 name 相同 */
  env?: string
  /** 出站时可替换 sentinel 的目标 host；优先于 vault 默认 meta */
  inject_hosts?: string[]
}

export interface ShellRunParams {
  sessionId: string
  rootId: string
  cwdRel?: string
  argv: string[]
  timeoutMs?: number
  networkIntent?: ShellNetworkIntent
  signal?: AbortSignal
  secret_refs?: ShellSecretRef[]
}

/** opptrix_run / shell_install 附带的 Python 运行时摘要（不暴露绝对路径） */
export interface ShellPythonRuntimeInfo {
  source: 'system' | 'opptrix' | 'none'
  version: string | null
  /** 本命令 argv 的 python/pip 是否被改写到当前优先解释器 */
  rewritten: boolean
}

export interface ShellRunResult {
  ok: boolean
  exit_code: number | null
  stdout: string
  stderr: string
  stdout_truncated: boolean
  stderr_truncated: boolean
  cwd: string
  command: string[]
  sandbox: true
  platform: Platform
  duration_ms: number
  python_runtime?: ShellPythonRuntimeInfo
  needs_network_egress?: {
    message: string
    suggested_host?: string
  }
}

/** 用户向网络隔离能力：完整 / 基础 / 无 */
export type ShellNetworkIsolationLevel = 'full' | 'basic' | 'none'

export interface ShellPlatformStatus {
  platform: Platform
  supported: boolean
  sandbox_available: boolean
  ready: boolean
  message: string
  missing_dependencies?: string[]
  setup_hint?: string
  /** Windows: WFP / sandbox user not provisioned yet */
  needs_windows_install?: boolean
  /** Linux: AppArmor / userns setup not applied yet (Ubuntu 24.04+ etc.) */
  needs_linux_install?: boolean
  /** Opptrix can trigger one system elevation (Windows UAC / Linux pkexec) */
  can_auto_install?: boolean
  /** User must approve system elevation once */
  needs_elevation?: boolean
  /** Linux: kernel user-namespace restriction (e.g. Ubuntu 24.04+) */
  userns_restricted?: boolean
  /** Windows：当前隔离模式（完整 / 基础） */
  windows_isolation_mode?: 'elevated' | 'unelevated'
  /** 用户向：网络隔离能力级别 */
  network_isolation_level?: ShellNetworkIsolationLevel
}

export interface ShellInstallParams {
  sessionId: string
  rootId: string
  cwdRel?: string
  manager: 'pip' | 'npm'
  packages: string[]
  signal?: AbortSignal
}
