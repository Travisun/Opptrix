import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  OPPTX_APPARMOR_PROFILE,
  buildAppArmorProfileContent,
  getLinuxSandboxInstallState,
  isOpptrixAppArmorProfileApplied,
  linuxCanAutoInstall,
  linuxSandboxNeedsProfileInstall,
  pkexecAvailable,
  resolveBwrapPathsForProfile,
} from './linux-sandbox-common.js'

export interface LinuxSandboxEnsureResult {
  ready: boolean
  cancelled?: boolean
  attemptedInstall?: boolean
  needs_elevation?: boolean
  can_auto_install?: boolean
  message?: string
}

let autoInstallAttempted = false

/** Reset for tests only. */
export function resetLinuxSandboxAutoInstallAttempt(): void {
  autoInstallAttempted = false
}

function writeTempProfile(content: string): string {
  const tmp = path.join(os.tmpdir(), `opptrix-bwrap-${process.pid}.apparmor`)
  fs.writeFileSync(tmp, content, { mode: 0o600 })
  return tmp
}

function runPkexecInstall(profileTmpPath: string): Promise<{ ok: boolean; cancelled: boolean }> {
  return new Promise(resolve => {
    const pkexecBin = fs.existsSync('/usr/bin/pkexec') ? '/usr/bin/pkexec' : '/bin/pkexec'
    const script = [
      'set -e',
      `install -m 644 ${JSON.stringify(profileTmpPath)} ${JSON.stringify(OPPTX_APPARMOR_PROFILE)}`,
      'if command -v apparmor_parser >/dev/null 2>&1; then',
      `  apparmor_parser -r ${JSON.stringify(OPPTX_APPARMOR_PROFILE)}`,
      'elif command -v systemctl >/dev/null 2>&1; then',
      '  systemctl reload apparmor',
      'else',
      '  exit 1',
      'fi',
    ].join('\n')

    const child = spawn(pkexecBin, ['/bin/bash', '-c', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })

    child.on('error', () => {
      resolve({ ok: false, cancelled: false })
    })

    child.on('close', code => {
      if (code === 0) {
        resolve({ ok: true, cancelled: false })
        return
      }
      const dismissed = code === 126
        || code === 127
        || /dismissed|not authorized|Not authorized|cancel/i.test(stderr)
      resolve({ ok: false, cancelled: dismissed })
    })
  })
}

async function installAppArmorProfileViaPkexec(bwrapPaths: string[]): Promise<{
  ok: boolean
  cancelled: boolean
}> {
  if (!pkexecAvailable()) {
    return { ok: false, cancelled: false }
  }
  const content = buildAppArmorProfileContent(bwrapPaths)
  const tmp = writeTempProfile(content)
  try {
    return await runPkexecInstall(tmp)
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Linux: verify isolation deps + AppArmor profile for userns-restricted systems;
 * optionally trigger one pkexec elevation. Idempotent after success or explicit cancel.
 */
export async function ensureLinuxSandboxReady(options?: {
  allowAutoInstall?: boolean
  forceRetry?: boolean
}): Promise<LinuxSandboxEnsureResult> {
  if (process.platform !== 'linux') {
    return { ready: true }
  }

  const bwrapPaths = resolveBwrapPathsForProfile()
  const state = getLinuxSandboxInstallState()

  if (!state.needsInstall) {
    return { ready: true }
  }

  const allowAuto = options?.allowAutoInstall === true
  const canAuto = linuxCanAutoInstall(state)
  const canTry = allowAuto
    && canAuto
    && (!autoInstallAttempted || options?.forceRetry === true)

  if (!canTry) {
    return {
      ready: false,
      needs_elevation: state.needsInstall && canAuto,
      can_auto_install: canAuto,
      message: canAuto
        ? '需要一次系统授权以完成命令隔离环境的安全设置，请稍后重试或在系统提示时允许'
        : '当前系统限制了命令隔离所需的安全机制，暂时无法启用；若无管理员权限，请联系系统管理员',
    }
  }

  autoInstallAttempted = true
  const install = await installAppArmorProfileViaPkexec(bwrapPaths)
  if (install.cancelled) {
    return {
      ready: false,
      cancelled: true,
      attemptedInstall: true,
      needs_elevation: canAuto,
      can_auto_install: canAuto,
      message: '未完成系统授权，命令隔离环境尚未就绪；可稍后在设置中重试',
    }
  }

  if (install.ok && isOpptrixAppArmorProfileApplied(bwrapPaths)) {
    return { ready: true, attemptedInstall: true }
  }

  return {
    ready: false,
    attemptedInstall: true,
    needs_elevation: canAuto,
    can_auto_install: canAuto,
    message: '命令隔离环境尚未就绪，请稍后重试',
  }
}

/** Exported for tests — re-check after mocked install. */
export function linuxSandboxProfileStillNeeded(): boolean {
  const bwrapPaths = resolveBwrapPathsForProfile()
  return linuxSandboxNeedsProfileInstall(bwrapPaths)
}
