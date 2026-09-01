import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SandboxManager,
  checkWindowsSandboxStatusAsync,
  resolveSrtWin,
  type Platform,
} from '@anthropic-ai/sandbox-runtime'
import { getSandboxSettings } from '../sandbox-settings-store.js'
import type { ShellPlatformStatus } from './types.js'
import { isWindowsSandboxProvisioned } from './ensure-windows-sandbox.js'
import { resolveBundledSandboxBinConfig, resolveVendoredSrtWinExe } from './resolve-sandbox-bins.js'
import { getLinuxSandboxInstallState, linuxCanAutoInstall } from './linux-sandbox-common.js'
import {
  isUnelevatedSpawnSupported,
  UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
} from './windows-unelevated/index.js'
import { resolveShellIsolationMode } from './isolation-mode.js'
import { isDockerEnv, resolveAgentSandboxMode } from '../env/docker-env.js'

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

function windowsHint(canAutoInstall: boolean, unelevatedReady: boolean): string | undefined {
  if (unelevatedReady) {
    return undefined
  }
  if (canAutoInstall) {
    return '首次使用完整隔离需要一次系统授权；也可在设置中改用基础隔离'
  }
  return '完整隔离尚未就绪；可稍后重试，或在设置中改用基础隔离'
}

export async function getShellPlatformStatus(): Promise<ShellPlatformStatus> {
  const platform = nodePlatformToSandboxPlatform()
  const agentSandbox = resolveAgentSandboxMode()

  if (agentSandbox === 'off') {
    return {
      platform: platform === 'unsupported' ? 'unknown' : platform,
      supported: true,
      sandbox_available: false,
      ready: true,
      message: isDockerEnv()
        ? 'Docker 自托管：命令以受限用户运行（可自由编程；private/system 由系统权限隔离），未启用 SRT'
        : '命令以系统权限运行，未启用 Agent 沙箱围栏',
      needs_elevation: false,
      can_auto_install: false,
      network_isolation_level: 'basic',
      agent_sandbox: 'off',
    }
  }

  // Docker-first：默认 workspace 隔离，不依赖 bwrap / SRT
  if (resolveShellIsolationMode() === 'workspace') {
    return {
      platform: platform === 'unsupported' ? 'unknown' : platform,
      supported: true,
      sandbox_available: false,
      ready: true,
      message: '命令在已授权工作区内运行（容器 + 工作区边界），无需系统级沙盒组件',
      needs_elevation: false,
      can_auto_install: false,
      network_isolation_level: 'basic',
      isolation_mode: 'workspace',
      agent_sandbox: 'full',
    }
  }

  if (platform === 'unsupported') {
    return {
      platform: 'unknown',
      supported: false,
      sandbox_available: false,
      ready: false,
      message: '当前系统暂不支持命令隔离环境',
      network_isolation_level: 'none',
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
  let windowsIsolationMode: 'elevated' | 'unelevated' | undefined
  let networkIsolationLevel: ShellPlatformStatus['network_isolation_level'] =
    platform === 'windows' ? 'full' : (ready ? 'full' : 'none')

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
    networkIsolationLevel = ready ? 'full' : 'none'
  } else if (platform === 'windows') {
    windowsIsolationMode = getSandboxSettings().windows_isolation_mode
    if (windowsIsolationMode === 'unelevated') {
      // 基础隔离：不要求 srt credPresent；不初始化 SRT 网络围栏
      const unelevatedOk = isUnelevatedSpawnSupported()
      ready = unelevatedOk
      needsWindowsInstall = false
      canAutoInstall = false
      needsElevation = false
      networkIsolationLevel = unelevatedOk ? 'basic' : 'none'
      message = unelevatedOk
        ? '基础隔离已就绪（出站由确认与白名单约束）'
        : UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE
      setupHint = unelevatedOk
        ? undefined
        : UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE
      // 分发缺失不影响 unelevated ready
      depErrors = []
    } else {
      try {
        const srtWinExe = resolveVendoredSrtWinExe()
        const srtWin = srtWinExe ? resolveSrtWin({ path: srtWinExe }) : undefined
        const win = await checkWindowsSandboxStatusAsync({ srtWin })
        const winReady = isWindowsSandboxProvisioned(win)
        ready = ready && winReady
        needsWindowsInstall = !winReady
        canAutoInstall = Boolean(srtWinExe) && needsWindowsInstall
        needsElevation = needsWindowsInstall && canAutoInstall
        networkIsolationLevel = ready ? 'full' : 'none'
        setupHint = winReady ? undefined : windowsHint(canAutoInstall, false)
        if (!ready && setupHint) message = setupHint
      } catch {
        ready = false
        networkIsolationLevel = 'none'
        message = '暂时无法确认命令隔离环境状态，请稍后重试'
      }
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
    windows_isolation_mode: windowsIsolationMode,
    network_isolation_level: networkIsolationLevel,
    isolation_mode: 'srt',
    agent_sandbox: 'full',
  }
}
