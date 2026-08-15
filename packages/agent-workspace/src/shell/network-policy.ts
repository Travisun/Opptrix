/**
 * 沙箱出站域名策略。
 *
 * DNS 策略（SRT）：
 * - 系统 getaddrinfo / 宿主代理解析不受 fence 限制，命令可正常解析公网域名。
 * - 沙盒内自行发起 UDP/53 的 dig/nslookup/host 等会被 fence。
 * - 授权对象是连接目标，不是 DNS；私网/localhost 解析后 connect 仍拒绝（assertAllowedHost / SSRF）。
 *
 * 出站授权模型：
 * - 会话默认 allowedDomains 含 PACKAGE_INSTALL_ALLOWED_DOMAINS + 当前 pip 镜像（决策 2）。
 * - 其它 host 按域名确认，本会话记住已 grant 的 host。
 * - OPPTRIX_SHELL_ALLOWED_DOMAINS ∪ 用户设置永久白名单（免确认）。
 * - 禁止 allow_all / 遇目标自动放行未知 host。
 */

import { DEFAULT_PIP_INDEX_URLS, isPrivateOrLocalHostPattern } from '@opptrix/shared'
import { assertAllowedHost } from '../ssrf.js'
import { getSandboxSettings } from '../sandbox-settings-store.js'
import { isEffectiveLanAllowed } from './session-lan-access.js'

/** 从 https/http URL 提取 hostname，并在有意义时附加 `*.parent` */
export function hostPatternsFromHttpsUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (pattern: string): void => {
    const normalized = pattern.trim().toLowerCase().replace(/\.$/, '')
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  }

  for (const raw of urls) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue
      const host = parsed.hostname.trim().toLowerCase().replace(/\.$/, '')
      if (!host) continue
      add(host)
      const labels = host.split('.').filter(Boolean)
      // e.g. mirrors.aliyun.com → *.aliyun.com；避免 *.com / *.cn
      if (labels.length >= 3) {
        const parent = labels.slice(1).join('.')
        if (parent.includes('.')) add(`*.${parent}`)
      }
    } catch {
      // 非法 URL 跳过
    }
  }
  return out
}

const OFFICIAL_PACKAGE_INSTALL_DOMAINS: readonly string[] = [
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

/** 联网安装白名单 — 官方源 ∪ 国内默认 pip 镜像 ∪ npm 国内镜像 */
export const PACKAGE_INSTALL_ALLOWED_DOMAINS: readonly string[] = [
  ...OFFICIAL_PACKAGE_INSTALL_DOMAINS,
  ...hostPatternsFromHttpsUrls(DEFAULT_PIP_INDEX_URLS),
  'registry.npmmirror.com',
  '*.npmmirror.com',
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

/** host 是否匹配域名 pattern 列表（含通配符 *.example.com） */
export function hostMatchesDomainPatterns(
  host: string,
  patterns: readonly string[],
): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized) return false
  for (const pattern of patterns) {
    const p = pattern.trim().toLowerCase().replace(/\.$/, '')
    if (!p) continue
    if (p.startsWith('*.')) {
      const base = p.slice(2)
      const suffix = p.slice(1)
      if (normalized === base || normalized.endsWith(suffix)) return true
    } else if (normalized === p) {
      return true
    }
  }
  return false
}

/** host 是否匹配合并永久白名单（含通配符 *.example.com） */
export function isHostInConfiguredAllowlist(host: string, sessionId?: string): boolean {
  return hostMatchesDomainPatterns(host, getGrantableMergedAllowedDomainsSync(sessionId))
}

/**
 * 会话默认包源（pip/npm 官方与镜像）— 围栏内免 network_install / egress 确认。
 * 不等于全网放行。
 */
export function isHostInPackageInstallAllowlist(
  host: string,
  pipIndexUrls?: readonly string[],
): boolean {
  return hostMatchesDomainPatterns(host, networkDomainsForInstallAllowed(pipIndexUrls))
}

/** 同步：合并名单经 LAN 策略与字面量私网过滤 */
export function getGrantableMergedAllowedDomainsSync(sessionId?: string): string[] {
  const allowLan = isEffectiveLanAllowed(sessionId)
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
export async function getGrantableMergedAllowedDomains(sessionId?: string): Promise<string[]> {
  const allowLan = isEffectiveLanAllowed(sessionId)
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

/**
 * 联网安装放行域：基础名单 ∪ extraUrls（通常为当前 pip_index_urls）解析出的 host。
 */
export function networkDomainsForInstallAllowed(extraUrls?: readonly string[]): string[] {
  return [...new Set([
    ...PACKAGE_INSTALL_ALLOWED_DOMAINS,
    ...hostPatternsFromHttpsUrls(extraUrls ?? []),
  ])]
}

function normalizeExactHosts(domains: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of domains) {
    const d = raw.trim().toLowerCase().replace(/\.$/, '')
    if (!d || d.startsWith('*.') || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

/**
 * 用户可见联网安装确认文案。
 * 展示顺序：preferredHosts（通常为当前 pipIndexUrls 解析 host）→ 其余 domains；最多 maxShow +「等」。
 */
export function formatNetworkInstallConfirmPrompt(
  domains: readonly string[],
  maxShow = 8,
  preferredHosts?: readonly string[],
): string {
  const preferred = normalizeExactHosts(preferredHosts ?? [])
  const rest = normalizeExactHosts(domains).filter(h => !preferred.includes(h))
  const ordered = [...preferred, ...rest]
  if (ordered.length === 0) {
    return '安装依赖需要访问外部包源。是否允许本次联网安装？'
  }
  const shown = ordered.slice(0, Math.max(1, maxShow))
  const list = shown.join('、')
  return `安装依赖需要访问外部包源（含 ${list} 等）。是否允许本次联网安装？`
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
  /** 当前 pip 镜像 URL；allowInstall 时并入 install allowlist */
  pipIndexUrls?: readonly string[]
}): string[] {
  const out: string[] = []
  if (opts.configuredDomains?.length) out.push(...opts.configuredDomains)
  if (opts.allowInstall) {
    out.push(...networkDomainsForInstallAllowed(opts.pipIndexUrls))
  }
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
