import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { resolveBundledSandboxBinConfig } from './resolve-sandbox-bins.js'

export const OPPTX_APPARMOR_PROFILE = '/etc/apparmor.d/opptrix-bwrap'
export const OPPTX_PROFILE_MARKER = '# opptrix-managed'

const SAFE_ABS_PATH = /^\/[\w./+-]+$/

export function isSafeAbsPath(p: string): boolean {
  return SAFE_ABS_PATH.test(p) && !p.includes('..')
}

export function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function readUserNsRestrictedSync(): boolean {
  try {
    const raw = fs.readFileSync(
      '/proc/sys/kernel/apparmor_restrict_unprivileged_userns',
      'utf8',
    ).trim()
    return raw === '1'
  } catch {
    return false
  }
}

export function resolveSystemBwrapPath(): string | undefined {
  const candidates = ['/usr/bin/bwrap', '/bin/bwrap']
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate
  }
  const which = spawnSync('which', ['bwrap'], { encoding: 'utf8' })
  if (which.status === 0) {
    const found = which.stdout.trim()
    if (found && isSafeAbsPath(found) && isExecutable(found)) return found
  }
  return undefined
}

/** All bwrap binaries that must be covered by AppArmor profiles. */
export function resolveBwrapPathsForProfile(): string[] {
  const paths = new Set<string>()
  const system = resolveSystemBwrapPath()
  if (system) paths.add(system)
  const bundled = resolveBundledSandboxBinConfig().bwrapPath
  if (bundled && isSafeAbsPath(bundled) && isExecutable(bundled)) {
    paths.add(path.resolve(bundled))
  }
  return [...paths]
}

export function buildAppArmorProfileContent(bwrapPaths: string[]): string {
  const validated = bwrapPaths.filter(p => isSafeAbsPath(p) && isExecutable(p))
  if (!validated.length) {
    throw new Error('no valid bwrap paths for AppArmor profile')
  }
  const blocks = validated.map(bwrapPath => {
    const profileName = `opptrix-bwrap-${Buffer.from(bwrapPath).toString('base64url')}`
    return [
      `profile ${profileName} ${bwrapPath} flags=(unconfined) {`,
      '  userns,',
      '  include if exists <local/bwrap>',
      '}',
    ].join('\n')
  })
  return [
    OPPTX_PROFILE_MARKER,
    'abi <abi/4.0>,',
    'include <tunables/global>',
    '',
    ...blocks,
    '',
  ].join('\n')
}

export function isOpptrixAppArmorProfileApplied(bwrapPaths: string[]): boolean {
  try {
    const content = fs.readFileSync(OPPTX_APPARMOR_PROFILE, 'utf8')
    if (!content.includes(OPPTX_PROFILE_MARKER)) return false
    for (const bwrapPath of bwrapPaths) {
      if (!content.includes(bwrapPath)) return false
    }
    return true
  } catch {
    return false
  }
}

export function probeBwrapUserNsBlocked(bwrapPath: string): boolean {
  if (!isExecutable(bwrapPath)) return false
  const probe = spawnSync(
    bwrapPath,
    ['--unshare-user', '--uid', '65534', '--gid', '65534', '--ro-bind', '/', '/', '--', 'true'],
    { encoding: 'utf8', timeout: 5000 },
  )
  if (probe.status === 0) return false
  const combined = `${probe.stderr}\n${probe.stdout}`
  return /userns|user namespace|apparmor|permission denied|Operation not permitted/i.test(combined)
}

export function isLinuxUserNsRestricted(bwrapPaths: string[]): boolean {
  if (readUserNsRestrictedSync()) return true
  for (const bwrapPath of bwrapPaths) {
    if (probeBwrapUserNsBlocked(bwrapPath)) return true
  }
  return false
}

export function linuxSandboxNeedsProfileInstall(bwrapPaths: string[]): boolean {
  if (!bwrapPaths.length) return false
  if (!isLinuxUserNsRestricted(bwrapPaths)) return false
  return !isOpptrixAppArmorProfileApplied(bwrapPaths)
}

export interface LinuxSandboxInstallState {
  needsInstall: boolean
  canAutoInstall: boolean
  needsElevation: boolean
  usernsRestricted: boolean
}

export function pkexecAvailable(): boolean {
  return fs.existsSync('/usr/bin/pkexec') || fs.existsSync('/bin/pkexec')
}

export function linuxCanAutoInstall(state: LinuxSandboxInstallState): boolean {
  return state.canAutoInstall && pkexecAvailable()
}

export function getLinuxSandboxInstallState(): LinuxSandboxInstallState {
  const bwrapPaths = resolveBwrapPathsForProfile()
  const usernsRestricted = isLinuxUserNsRestricted(bwrapPaths)
  const needsInstall = linuxSandboxNeedsProfileInstall(bwrapPaths)
  const canAutoInstall = needsInstall && bwrapPaths.length > 0
  return {
    needsInstall,
    canAutoInstall,
    needsElevation: needsInstall && canAutoInstall,
    usernsRestricted,
  }
}
