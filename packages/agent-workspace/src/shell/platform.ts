import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SandboxManager,
  checkWindowsSandboxStatusAsync,
  resolveSrtWin,
  type Platform,
} from '@anthropic-ai/sandbox-runtime'
import type { ShellPlatformStatus } from './types.js'
import { resolveBundledSandboxBinConfig, resolveVendoredSrtWinExe } from './resolve-sandbox-bins.js'
import { getLinuxSandboxInstallState, linuxCanAutoInstall } from './linux-sandbox-common.js'

function nodePlatformToSandboxPlatform(): Platform | 'unsupported' {
  if (!SandboxManager.isSupportedPlatform()) return 'unsupported'
  const p = os.platform()
  if (p === 'darwin') return 'macos'
  if (p === 'linux') return 'linux'
  if (p === 'win32') return 'windows'
  return 'unsupported'
}

function isUserNsRestricted(errors: string[]): boolean {
  return errors.some(m =>
    /userns|user namespace|apparmor_restrict_unprivileged|unprivileged user namespaces/i.test(m),
  )
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function checkLinuxDepsWithBundled(bundled: ReturnType<typeof resolveBundledSandboxBinConfig>): string[] {
  const errors: string[] = []
  if (bundled.bwrapPath) {
    if (!isExecutable(bundled.bwrapPath)) {
      errors.push(`bubblewrap (bwrap) not executable at ${bundled.bwrapPath}`)
    }
  }
  if (bundled.socatPath) {
    if (!isExecutable(bundled.socatPath)) {
      errors.push(`socat not executable at ${bundled.socatPath}`)
    }
  }
  const rgCmd = bundled.ripgrep?.command ?? 'rg'
  if (bundled.ripgrep?.command) {
    if (!isExecutable(bundled.ripgrep.command)) {
      errors.push(`ripgrep (${rgCmd}) not executable at ${bundled.ripgrep.command}`)
    }
  }
  return errors
}

function bundledLinuxToolingPresent(): boolean {
  const stage = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  if (!stage) return false
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch
  const dir = path.join(stage, 'sandbox-bins', arch)
  for (const name of ['bwrap', 'socat', 'rg']) {
    try {
      fs.accessSync(path.join(dir, name), fs.constants.X_OK)
    } catch {
      return false
    }
  }
  return true
}

function linuxHint(errors: string[], canAutoInstall: boolean): string | undefined {
  if (isUserNsRestricted(errors)) {
    if (canAutoInstall) {
      return '首次使用命令隔离需要一次系统授权；运行命令时将自动请求，也可稍后在设置中重试'
    }
    return '当前系统限制了命令隔离所需的安全机制，暂时无法启用；若无管理员权限，请联系系统管理员'
  }
  if (!errors.some(m => /bubblewrap|bwrap|socat|ripgrep|\brg\b/i.test(m))) {
    return undefined
  }
  if (bundledLinuxToolingPresent()) {
    return '命令隔离所需组件未就绪，请重启应用后重试；若仍不可用，请使用官方 deb 安装包或联系支持'
  }
  return '命令隔离所需组件未就绪；请使用官方 deb 安装包，或重启应用后重试'
}

function windowsReady(
  status: Awaited<ReturnType<typeof checkWindowsSandboxStatusAsync>>,
): boolean {
  return Boolean(status.user?.provisioned && status.wfp?.state === 'installed')
}

function windowsHint(canAutoInstall: boolean): string | undefined {
  if (canAutoInstall) {
    return '首次使用命令隔离需要一次系统授权；运行命令时将自动请求，也可稍后在设置中重试'
  }
  return '命令隔离环境尚未就绪，请稍后重试'
}

export async function getShellPlatformStatus(): Promise<ShellPlatformStatus> {
  const platform = nodePlatformToSandboxPlatform()
  if (platform === 'unsupported') {
    return {
      platform: 'unknown',
      supported: false,
      sandbox_available: false,
      ready: false,
      message: '当前系统暂不支持命令隔离环境',
    }
  }

  const bundled = resolveBundledSandboxBinConfig()
  let depErrors: string[] = []
  if (platform === 'linux' && (bundled.bwrapPath || bundled.socatPath || bundled.ripgrep?.command)) {
    depErrors.push(...checkLinuxDepsWithBundled(bundled))
  }
  if (platform !== 'windows') {
    const deps = await SandboxManager.checkDependenciesAsync(bundled.ripgrep)
    for (const err of deps.errors) {
      if (bundled.bwrapPath && /bwrap|bubblewrap/i.test(err)) continue
      if (bundled.socatPath && /socat/i.test(err)) continue
      if (bundled.ripgrep?.command && /ripgrep|\brg\b/i.test(err)) continue
      if (!depErrors.includes(err)) depErrors.push(err)
    }
  } else if (!resolveVendoredSrtWinExe()) {
    depErrors.push('Windows 命令隔离组件未随应用分发')
  }

  let ready = depErrors.length === 0
  let setupHint: string | undefined
  let message = ready
    ? '命令隔离环境已就绪'
    : '命令隔离组件未就绪，暂时无法运行命令'

  let usernsRestricted = platform === 'linux' && isUserNsRestricted(depErrors)

  let needsWindowsInstall = false
  let needsLinuxInstall = false
  let canAutoInstall = false
  let needsElevation = false

  if (platform === 'linux') {
    const linuxState = getLinuxSandboxInstallState()
    if (linuxState.usernsRestricted) {
      usernsRestricted = true
    }
    needsLinuxInstall = linuxState.needsInstall
    canAutoInstall = linuxCanAutoInstall(linuxState)
    needsElevation = linuxState.needsInstall && canAutoInstall
    ready = ready && !needsLinuxInstall
    setupHint = linuxHint(depErrors, canAutoInstall)
    if (!ready && setupHint) message = setupHint
  } else if (platform === 'windows') {
    try {
      const srtWinExe = resolveVendoredSrtWinExe()
      const srtWin = srtWinExe ? resolveSrtWin({ path: srtWinExe }) : undefined
      const win = await checkWindowsSandboxStatusAsync({ srtWin })
      ready = ready && windowsReady(win)
      needsWindowsInstall = !windowsReady(win)
      canAutoInstall = Boolean(srtWinExe) && needsWindowsInstall
      needsElevation = needsWindowsInstall && canAutoInstall
      setupHint = windowsReady(win) ? undefined : windowsHint(canAutoInstall)
      if (!ready && setupHint) message = setupHint
    } catch {
      ready = false
      message = '暂时无法确认命令隔离环境状态，请稍后重试'
    }
  }

  return {
    platform,
    supported: true,
    sandbox_available: SandboxManager.isSandboxingEnabled(),
    ready,
    message,
    missing_dependencies: depErrors.length ? [...depErrors] : undefined,
    setup_hint: setupHint,
    needs_windows_install: platform === 'windows' ? needsWindowsInstall : undefined,
    needs_linux_install: platform === 'linux' ? needsLinuxInstall : undefined,
    can_auto_install: (platform === 'windows' || platform === 'linux') ? canAutoInstall : undefined,
    needs_elevation: (platform === 'windows' || platform === 'linux') ? needsElevation : undefined,
    userns_restricted: usernsRestricted || undefined,
  }
}
