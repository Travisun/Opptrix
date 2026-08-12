import {
  checkWindowsSandboxStatusAsync,
  installWindowsSandboxAsync,
  resolveSrtWin,
} from '@anthropic-ai/sandbox-runtime'
import { getSandboxSettings } from '../sandbox-settings-store.js'
import { resolveVendoredSrtWinExe } from './resolve-sandbox-bins.js'
import {
  isUnelevatedSpawnSupported,
  UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
} from './windows-unelevated/index.js'

export interface WindowsSandboxEnsureResult {
  ready: boolean
  cancelled?: boolean
  attemptedInstall?: boolean
  message?: string
}

let autoInstallAttempted = false

/**
 * Windows sandbox ready check — aligned with upstream `interpretDependencyProbes`:
 * - requires user.provisioned && user.credPresent
 * - wfp `cannot-read` is NOT an error (unelevated process cannot enumerate BFE)
 * - wfp `absent` means not installed; `installed` is OK
 */
export function isWindowsSandboxProvisioned(status: {
  user?: { provisioned?: boolean; credPresent?: boolean }
  wfp?: { state?: string }
}): boolean {
  const userOk = Boolean(status.user?.provisioned && status.user?.credPresent)
  if (!userOk) return false
  const wfpState = status.wfp?.state
  // cannot-read = 非提升进程无法读 BFE；已安装时常见，不算未就绪
  // absent = 过滤器确实不存在 → 未就绪
  // installed = 可读且已装 → 就绪
  return wfpState === 'installed' || wfpState === 'cannot-read'
}

/** Reset for tests only. */
export function resetWindowsSandboxAutoInstallAttempt(): void {
  autoInstallAttempted = false
}

/**
 * Windows: verify isolation is provisioned; optionally trigger one self-elevating install (UAC).
 * Idempotent — does not re-prompt on every call after a successful install or explicit cancel.
 *
 * unelevated（基础隔离）不要求 srt credPresent，也不初始化 SRT WFP。
 */
export async function ensureWindowsSandboxReady(options?: {
  allowAutoInstall?: boolean
  forceRetry?: boolean
  /** 覆盖设置中的模式（测试 / 凭据刷新路径） */
  isolationMode?: 'elevated' | 'unelevated'
}): Promise<WindowsSandboxEnsureResult> {
  if (process.platform !== 'win32') {
    return { ready: true }
  }

  const mode = options?.isolationMode
    ?? getSandboxSettings().windows_isolation_mode
  if (mode === 'unelevated') {
    if (!isUnelevatedSpawnSupported()) {
      return {
        ready: false,
        message: UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
      }
    }
    return { ready: true }
  }

  const srtWinExe = resolveVendoredSrtWinExe()
  const srtWin = srtWinExe ? resolveSrtWin({ path: srtWinExe }) : undefined

  let status = await checkWindowsSandboxStatusAsync({ srtWin })
  if (isWindowsSandboxProvisioned(status)) {
    return { ready: true }
  }

  const allowAuto = options?.allowAutoInstall === true
  const canTry = allowAuto && srtWin != null && (!autoInstallAttempted || options?.forceRetry === true)

  if (!canTry) {
    return {
      ready: false,
      message: '需要一次系统授权以完成命令隔离环境的安全设置，请稍后重试或在系统提示时允许',
    }
  }

  autoInstallAttempted = true
  const install = await installWindowsSandboxAsync({ srtWin })
  if (install.cancelled) {
    return {
      ready: false,
      cancelled: true,
      attemptedInstall: true,
      message: '未完成系统授权，命令隔离环境尚未就绪；可稍后在设置中重试',
    }
  }

  status = await checkWindowsSandboxStatusAsync({ srtWin })
  if (isWindowsSandboxProvisioned(status)) {
    return { ready: true, attemptedInstall: true }
  }

  return {
    ready: false,
    attemptedInstall: true,
    message: '命令隔离环境尚未就绪，请稍后重试',
  }
}
