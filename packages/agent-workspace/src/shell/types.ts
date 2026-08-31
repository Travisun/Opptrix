import type { Platform } from '@anthropic-ai/sandbox-runtime'

export type ShellNetworkIntent = 'none' | 'install'

/** 升权：默认围栏内；unsandboxed 每次人批、禁止 session sticky */
export type ShellEscalate = 'none' | 'unsandboxed'

/** 完整隔离（SRT）| 基础隔离（如 Windows unelevated）| 工作区隔离（grant+Deny，无 SRT） */
export type ShellIsolation = 'full' | 'basic' | 'workspace'

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
  /** 主参数：真 shell 命令字符串 */
  command?: string
  /**
   * @deprecated 兼容旧客户端 — 无 command 时 join 为 command
   */
  argv?: string[]
  timeoutMs?: number
  networkIntent?: ShellNetworkIntent
  /** 出围栏：每次确认，禁止本对话 sticky */
  escalate?: ShellEscalate
  signal?: AbortSignal
  secret_refs?: ShellSecretRef[]
  /**
   * 后台执行：立即返回 job_id（经 JobBus）；墙钟上限默认 30min。
   * `OPPTRIX_SHELL_BG=0` 时拒绝。
   */
  background?: boolean
  /** 可选任务标题（面板展示）；亦可用 name */
  title?: string
  name?: string
}

/** opptrix_run(background:true) 立即返回体（供 auto-watch） */
export interface ShellBackgroundStartResult {
  ok: true
  status: 'running'
  job_id: string
  kind: 'shell-command'
  message: string
  command_summary: string
  eta_seconds?: number
  suggested_wake_seconds?: number
  async_hint?: string
  poll_hint?: string
  isolation?: ShellIsolation
  sandbox?: boolean
}

/** opptrix_run 附带的 Python 运行时摘要（不暴露绝对路径） */
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
  /** 生效 argv（增强解析后）；兼容旧字段名 */
  command: string[]
  /** 提交给沙箱/shell 的命令字符串 */
  command_string?: string
  /**
   * 子进程 HOME/USERPROFILE = 当前 grant 根（非宿主家目录、也非 cwd）。
   * `~` 展开到 grant 根；相对路径仍相对 cwd（cwdRel）。勿把 `~/` 当相对 cwd。
   */
  home_is_grant_root?: true
  /** 路径语义短提示（无绝对路径） */
  path_note?: string
  /** 完整 | 基础 | 工作区隔离；unsandboxed 时仍标 basic 并带 escalated */
  isolation: ShellIsolation
  /** 是否以出围栏方式执行（每次确认） */
  escalated?: boolean
  blocked_by?: string
  suggested_escalate?: 'network' | 'unsandboxed' | string
  /** SRT 完整隔离为 true；workspace / unsandboxed 为 false */
  sandbox: boolean
  platform: Platform
  duration_ms: number
  python_runtime?: ShellPythonRuntimeInfo
  /** @deprecated 兼容过渡：等同 suggested_escalate=network 的旧载荷 */
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
  /** 产品隔离形态：默认 workspace；OPPTRIX_SHELL_ISOLATION=srt 时为 srt */
  isolation_mode?: 'workspace' | 'srt'
}

export interface ShellInstallParams {
  sessionId: string
  rootId: string
  cwdRel?: string
  manager: 'pip' | 'npm'
  packages: string[]
  signal?: AbortSignal
}
