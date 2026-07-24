import net from 'node:net'

/** 沙盒出站白名单 — 存 user-store `preference` / `sandbox_settings` */
export interface SandboxSettings {
  allowed_domains: string[]
  allow_lan_access: boolean
}

export const DEFAULT_SANDBOX_SETTINGS: SandboxSettings = {
  allowed_domains: [],
  allow_lan_access: false,
}

export function normalizeSandboxDomainLine(line: string): string {
  let s = line.trim().toLowerCase()
  if (!s) return ''
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1)
  }
  return s.replace(/\.$/, '')
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false
  const [a, b] = parts
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('fe80:')) return true
  if (lower.startsWith('::ffff:127.')) return true
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (v4Mapped) return isPrivateIpv4(v4Mapped[1])
  return false
}

/** 是否为私网 / localhost 字面量（域名或 IP） */
export function isPrivateOrLocalHostPattern(host: string): boolean {
  const h = normalizeSandboxDomainLine(host)
  if (!h || h === 'localhost') return true
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true
  const ver = net.isIP(h)
  if (ver === 4) return isPrivateIpv4(h)
  if (ver === 6) return isPrivateIpv6(h)
  return false
}

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function isValidDomainPattern(pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const rest = pattern.slice(2)
    if (!rest) return false
    return rest.split('.').every(label => DOMAIN_LABEL.test(label))
  }
  if (net.isIP(pattern)) return true
  return pattern.split('.').every(label => DOMAIN_LABEL.test(label))
}

export function normalizeSandboxSettings(
  raw: Partial<SandboxSettings> | null | undefined,
): SandboxSettings {
  const domains = Array.isArray(raw?.allowed_domains)
    ? raw.allowed_domains
      .map(normalizeSandboxDomainLine)
      .filter(Boolean)
    : []
  return {
    allowed_domains: [...new Set(domains)],
    allow_lan_access: raw?.allow_lan_access === true,
  }
}

export type ValidateSandboxSettingsResult =
  | { ok: true; settings: SandboxSettings }
  | { ok: false; error: string; invalid_lines?: string[] }

/** PUT 校验：非法行拒绝；关 LAN 时含私网/localhost 拒绝 */
export function validateSandboxSettingsInput(
  input: Partial<SandboxSettings> | null | undefined,
): ValidateSandboxSettingsResult {
  if (input == null || typeof input !== 'object') {
    return { ok: false, error: '请求体无效' }
  }

  const allowLan = input.allow_lan_access === true
  const rawLines = Array.isArray(input.allowed_domains) ? input.allowed_domains : []
  const invalidLines: string[] = []
  const normalized: string[] = []

  for (const rawLine of rawLines) {
    if (typeof rawLine !== 'string') {
      invalidLines.push(String(rawLine))
      continue
    }
    const line = normalizeSandboxDomainLine(rawLine)
    if (!line) continue
    if (!isValidDomainPattern(line)) {
      invalidLines.push(rawLine.trim())
      continue
    }
    normalized.push(line)
  }

  if (invalidLines.length > 0) {
    return {
      ok: false,
      error: `以下条目格式无效：${invalidLines.join('、')}`,
      invalid_lines: invalidLines,
    }
  }

  const settings: SandboxSettings = {
    allowed_domains: [...new Set(normalized)],
    allow_lan_access: allowLan,
  }

  if (!allowLan) {
    const blocked = settings.allowed_domains.filter(isPrivateOrLocalHostPattern)
    if (blocked.length > 0) {
      return {
        ok: false,
        error: `未开启局域网访问时，不能添加本地或私网地址：${blocked.join('、')}`,
        invalid_lines: blocked,
      }
    }
  }

  return { ok: true, settings }
}
