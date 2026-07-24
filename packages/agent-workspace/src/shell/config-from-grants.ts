import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  getDefaultWritePaths,
  type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime'
import { resolveUserDataRoot } from '@opptrix/shared'
import { buildGlobalDenyPaths } from '../deny.js'
import type { WorkspaceGrant } from '../grants.js'
import {
  networkDomainsForInstallAllowed,
  networkDomainsWhenDenied,
} from './network-policy.js'
import { resolveBundledSandboxBinConfig } from './resolve-sandbox-bins.js'

async function realpathSafe(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return path.resolve(p)
    throw err
  }
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    const norm = path.resolve(p)
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(norm)
  }
  return out
}

/** 解释器/系统只读路径 — 供 sandbox 内 python/node 启动 */
function systemReadAllowPaths(): string[] {
  const platform = os.platform()
  if (platform === 'win32') {
    const windir = process.env.WINDIR ?? 'C:\\Windows'
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
    return uniquePaths([
      windir,
      path.join(windir, 'System32'),
      pf,
      process.env['ProgramFiles(x86)'] ?? path.join(pf, ' (x86)'),
      process.env.APPDATA ?? '',
      process.env.LOCALAPPDATA ?? '',
    ].filter(Boolean))
  }
  if (platform === 'darwin') {
    return uniquePaths([
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/Library/Frameworks/Python.framework',
      '/System/Library',
      '/private/tmp',
      '/var/folders',
    ])
  }
  return uniquePaths([
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/usr/local/bin',
    '/lib',
    '/lib64',
    '/usr/lib',
    '/tmp',
    '/var/tmp',
  ])
}

function systemWriteAllowPaths(): string[] {
  const platform = os.platform()
  if (platform === 'win32') {
    return uniquePaths([
      process.env.TEMP ?? '',
      process.env.TMP ?? '',
      process.env.LOCALAPPDATA ?? '',
    ].filter(Boolean))
  }
  return uniquePaths(['/tmp', '/var/tmp', '/private/tmp'])
}

export interface BuildSandboxConfigOptions {
  grants: readonly WorkspaceGrant[]
  allowNetworkInstall: boolean
}

/** 从 session grants 构建 SandboxRuntimeConfig */
export async function buildSandboxConfigFromGrants(
  opts: BuildSandboxConfigOptions,
): Promise<SandboxRuntimeConfig> {
  const userData = path.resolve(resolveUserDataRoot())
  const homedir = os.homedir()
  const grantRealpaths = await Promise.all(
    opts.grants.map(g => realpathSafe(g.abs_path)),
  )

  // 必须用原始 grants 下标对齐 grantRealpaths；filter 后再用 i 会错位
  const rwPaths = uniquePaths(
    opts.grants.flatMap((g, i) => (g.mode === 'rw' ? [grantRealpaths[i]] : [])),
  )

  const roPaths = uniquePaths(
    opts.grants.flatMap((g, i) => (g.mode === 'ro' ? [grantRealpaths[i]] : [])),
  )

  const denyRead = uniquePaths([
    userData,
    homedir,
    path.join(homedir, '.ssh'),
    ...buildGlobalDenyPaths(),
  ])

  const allowRead = uniquePaths([
    ...grantRealpaths,
    ...systemReadAllowPaths(),
  ])

  const allowWrite = uniquePaths([
    ...rwPaths,
    ...systemWriteAllowPaths(),
    ...getDefaultWritePaths(),
  ])

  const denyWrite = uniquePaths([
    ...buildGlobalDenyPaths(),
    ...roPaths,
  ])

  const allowedDomains = opts.allowNetworkInstall
    ? networkDomainsForInstallAllowed()
    : networkDomainsWhenDenied()

  return {
    ...resolveBundledSandboxBinConfig(),
    network: {
      allowedDomains,
      deniedDomains: [],
    },
    filesystem: {
      denyRead,
      allowRead,
      allowWrite,
      denyWrite,
    },
    git: {
      safeDirectories: grantRealpaths,
    },
  }
}

/** 测试辅助：同步 grants 路径（不 realpath） */
export function buildSandboxConfigFromGrantPaths(
  grants: Array<{ abs_path: string; mode: 'ro' | 'rw' }>,
  allowNetworkInstall: boolean,
): SandboxRuntimeConfig {
  const userData = path.resolve(resolveUserDataRoot())
  const homedir = os.homedir()
  const rwPaths = grants.filter(g => g.mode === 'rw').map(g => path.resolve(g.abs_path))
  const roPaths = grants.filter(g => g.mode === 'ro').map(g => path.resolve(g.abs_path))
  const grantPaths = grants.map(g => path.resolve(g.abs_path))

  return {
    ...resolveBundledSandboxBinConfig(),
    network: {
      allowedDomains: allowNetworkInstall
        ? networkDomainsForInstallAllowed()
        : networkDomainsWhenDenied(),
      deniedDomains: [],
    },
    filesystem: {
      denyRead: uniquePaths([userData, homedir, path.join(homedir, '.ssh'), ...buildGlobalDenyPaths()]),
      allowRead: uniquePaths([...grantPaths, ...systemReadAllowPaths()]),
      allowWrite: uniquePaths([...rwPaths, ...systemWriteAllowPaths(), ...getDefaultWritePaths()]),
      denyWrite: uniquePaths([...buildGlobalDenyPaths(), ...roPaths]),
    },
    git: { safeDirectories: grantPaths },
  }
}
