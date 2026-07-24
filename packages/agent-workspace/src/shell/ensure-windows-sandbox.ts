import {
  checkWindowsSandboxStatusAsync,
  installWindowsSandboxAsync,
  resolveSrtWin,
} from '@anthropic-ai/sandbox-runtime'
import { resolveVendoredSrtWinExe } from './resolve-sandbox-bins.js'

export interface WindowsSandboxEnsureResult {
  ready: boolean
  cancelled?: boolean
  attemptedInstall?: boolean
  message?: string
}

let autoInstallAttempted = false

function windowsProvisioned(
  status: Awaited<ReturnType<typeof checkWindowsSandboxStatusAsync>>,
): boolean {
  return Boolean(status.user?.provisioned && status.wfp?.state === 'installed')
}

/** Reset for tests only. */
export function resetWindowsSandboxAutoInstallAttempt(): void {
  autoInstallAttempted = false
}

/**
 * Windows: verify isolation is provisioned; optionally trigger one self-elevating install (UAC).
 * Idempotent — does not re-prompt on every call after a successful install or explicit cancel.
 */
export async function ensureWindowsSandboxReady(options?: {
  allowAutoInstall?: boolean
  forceRetry?: boolean
}): Promise<WindowsSandboxEnsureResult> {
  if (process.platform !== 'win32') {
    return { ready: true }
  }

  const srtWinExe = resolveVendoredSrtWinExe()
  const srtWin = srtWinExe ? resolveSrtWin({ path: srtWinExe }) : undefined

  let status = await checkWindowsSandboxStatusAsync({ srtWin })
  if (windowsProvisioned(status)) {
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
  if (windowsProvisioned(status)) {
    return { ready: true, attemptedInstall: true }
  }

  return {
    ready: false,
    attemptedInstall: true,
    message: '命令隔离环境尚未就绪，请稍后重试',
  }
}
