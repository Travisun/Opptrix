/**
 * 沙箱出站域名策略。
 *
 * DNS 策略（SRT）：
 * - 系统 getaddrinfo / 宿主代理解析不受 fence 限制，命令可正常解析公网域名。
 * - 沙盒内自行发起 UDP/53 的 dig/nslookup/host 等会被 fence；这些工具不在 ALLOWED_BINARIES。
 * - 授权对象是连接目标，不是 DNS；私网/localhost 解析后 connect 仍拒绝（assertAllowedHost / SSRF）。
 *
 * 出站授权模型（Claude Code 对齐）：
 * - 默认 allowedDomains=[]；按域名确认，本会话记住已 grant 的 host。
 * - OPPTRIX_SHELL_ALLOWED_DOMAINS ∪ 用户设置永久白名单（免确认）。
 * - 禁止 allow_all / 遇目标自动放行未知 host。
 */

import { isPrivateOrLocalHostPattern } from '@opptrix/shared'
import { assertAllowedHost } from '../ssrf.js'
import { getSandboxSettings } from '../sandbox-settings-store.js'

/** 联网安装白名单 — PyPI / npm 及常见 CDN */
export const PACKAGE_INSTALL_ALLOWED_DOMAINS: readonly string[] = [
  'pypi.org',
  '*.pypi.org',
  'files.pythonhosted.org',
  '*.pythonhosted.org',
  'registry.npmjs.org',
  '*.npmjs.org',
  'registry.yarnpkg.com',
  '*.yarnpkg.com',
  'github.com',
  '*.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'codeload.github.com',
]

/** SRT schema 不允许 allowedDomains 使用裸 `*` */
export const SRT_SUPPORTS_ALLOW_ALL_IN_ALLOWED_DOMAINS = false

let cachedConfiguredDomains: string[] | null = null

export function resetConfiguredAllowedDomainsForTests(): void {
  cachedConfiguredDomains = null
}

/** 从 OPPTRIX_SHELL_ALLOWED_DOMAINS 读取预置白名单（逗号分隔，支持 *.example.com） */
export function getConfiguredAllowedDomains(): string[] {
  if (cachedConfiguredDomains != null) return [...cachedConfiguredDomains]
  const raw = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS?.trim()
  if (!raw) {
    cachedConfiguredDomains = []
    return []
  }
  cachedConfiguredDomains = raw
    .split(',')
    .map(d => d.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean)
  return [...cachedConfiguredDomains]
}

function isObviouslyBlockedHostname(host: string, allowLan: boolean): boolean {
  if (allowLan) return false
  return isPrivateOrLocalHostPattern(host)
}

/** env ∪ 用户设置（未做 SSRF 校验） */
export function getMergedRawAllowedDomains(): string[] {
  const userDomains = getSandboxSettings().allowed_domains
  return [...new Set([...getConfiguredAllowedDomains(), ...userDomains])]
}

function filterLanPolicy(domains: readonly string[], allowLan: boolean): string[] {
  if (allowLan) return [...domains]
  return domains.filter(d => !isPrivateOrLocalHostPattern(d))
}

/** host 是否匹配合并永久白名单（含通配符 *.example.com） */
export function isHostInConfiguredAllowlist(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized) return false
  const patterns = getGrantableMergedAllowedDomainsSync()
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2)
      const suffix = pattern.slice(1)
      if (normalized === base || normalized.endsWith(suffix)) return true
    } else if (normalized === pattern) {
      return true
    }
  }
  return false
}

/** 同步：合并名单经 LAN 策略与字面量私网过滤 */
export function getGrantableMergedAllowedDomainsSync(): string[] {
  const allowLan = getSandboxSettings().allow_lan_access
  const merged = filterLanPolicy(getMergedRawAllowedDomains(), allowLan)
  return merged.filter(p => {
    if (p.startsWith('*.')) return true
    return !isObviouslyBlockedHostname(p, allowLan)
  })
}

/** @deprecated 使用 getGrantableMergedAllowedDomainsSync */
export function getGrantableConfiguredAllowedDomainsSync(): string[] {
  return getGrantableMergedAllowedDomainsSync()
}

/** 异步 SSRF 校验后返回可写入 allowlist 的合并域 */
export async function getGrantableMergedAllowedDomains(): Promise<string[]> {
  const allowLan = getSandboxSettings().allow_lan_access
  const out: string[] = []
  for (const pattern of filterLanPolicy(getMergedRawAllowedDomains(), allowLan)) {
    if (pattern.startsWith('*.')) {
      out.push(pattern)
      continue
    }
    if (isObviouslyBlockedHostname(pattern, allowLan)) continue
    try {
      await assertAllowedHost(new URL(`http://${pattern}/`), { allowLan })
      out.push(pattern)
    } catch {
      // 私网 / localhost / 无法解析 — 不写入 allowlist
    }
  }
  return out
}

/** @deprecated 使用 getGrantableMergedAllowedDomains */
export async function getGrantableConfiguredAllowedDomains(): Promise<string[]> {
  return getGrantableMergedAllowedDomains()
}

export function networkDomainsForInstallAllowed(): string[] {
  return [...PACKAGE_INSTALL_ALLOWED_DOMAINS]
}

export function networkDomainsWhenDenied(): string[] {
  return []
}

/** 用户确认后的会话/一次性出站 host */
export function networkDomainsForSessionHost(hostname: string): string[] {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!host) return []
  return [host]
}

/** 网络诊断（ping 等）允许访问的目标主机 — 仅加入用户确认后的具体 host */
export function networkDomainsForDiagnosticTarget(hostname: string): string[] {
  return networkDomainsForSessionHost(hostname)
}

/** 合并 allowlist：configured ∪ install ∪ session/diagnostic/once hosts */
export function mergeAllowedNetworkDomains(opts: {
  allowInstall: boolean
  diagnosticTargets?: readonly string[]
  sessionHosts?: readonly string[]
  configuredDomains?: readonly string[]
}): string[] {
  const out: string[] = []
  if (opts.configuredDomains?.length) out.push(...opts.configuredDomains)
  if (opts.allowInstall) out.push(...networkDomainsForInstallAllowed())
  if (opts.diagnosticTargets?.length) {
    for (const target of opts.diagnosticTargets) {
      out.push(...networkDomainsForDiagnosticTarget(target))
    }
  }
  if (opts.sessionHosts?.length) {
    for (const host of opts.sessionHosts) {
      out.push(...networkDomainsForSessionHost(host))
    }
  }
  return [...new Set(out)]
}
