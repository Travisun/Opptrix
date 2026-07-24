import type { Platform } from '@anthropic-ai/sandbox-runtime'

export type ShellNetworkIntent = 'none' | 'install'

export interface ShellRunParams {
  sessionId: string
  rootId: string
  cwdRel?: string
  argv: string[]
  timeoutMs?: number
  networkIntent?: ShellNetworkIntent
  signal?: AbortSignal
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
}

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
}

export interface ShellInstallParams {
  sessionId: string
  rootId: string
  cwdRel?: string
  manager: 'pip' | 'npm'
  packages: string[]
  signal?: AbortSignal
}
