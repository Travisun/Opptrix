/** Per-provider proxy mode; `inherit` falls back to the global outbound proxy when enabled. */
export type ProviderProxyMode = 'inherit' | 'none' | 'custom'

export interface SystemProxySettings {
  enabled: boolean
  /** http(s):// or socks5:// / socks4:// */
  url?: string
}

export interface ProviderProxySettings {
  mode?: ProviderProxyMode
  url?: string
}

const PROXY_URL_RE = /^(https?|socks5|socks4):\/\/.+/i

/** Trim; empty string → null. Does not validate scheme. */
export function normalizeProxyUrlInput(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? '').trim()
  return trimmed.length ? trimmed : null
}

/** Validate proxy URL for storage / outbound use. */
export function isValidProxyUrl(url: string): boolean {
  const u = normalizeProxyUrlInput(url)
  if (!u) return false
  try {
    const parsed = new URL(u)
    const scheme = parsed.protocol.replace(':', '').toLowerCase()
    if (!['http', 'https', 'socks5', 'socks4'].includes(scheme)) return false
    return Boolean(parsed.hostname)
  } catch {
    return PROXY_URL_RE.test(u)
  }
}

export function validateProxyUrlInput(raw: string | undefined | null): string | null {
  const u = normalizeProxyUrlInput(raw)
  if (!u) return null
  if (!isValidProxyUrl(u)) {
    throw new Error('代理地址须以 http://、https://、socks5:// 或 socks4:// 开头')
  }
  return u
}

export function normalizeProviderProxyMode(mode: unknown): ProviderProxyMode {
  if (mode === 'none' || mode === 'custom' || mode === 'inherit') return mode
  return 'inherit'
}

/**
 * Resolve outbound proxy URL for an LLM provider (string or unset).
 * `none` returns undefined — use {@link resolveOutboundProxyInit} when force-direct (`false`) is required.
 * Priority: provider custom > provider none (direct) > system > direct.
 */
export function resolveEffectiveProxyUrl(
  provider: ProviderProxySettings | undefined | null,
  system: SystemProxySettings | undefined | null,
): string | undefined {
  const mode = normalizeProviderProxyMode(provider?.mode)
  if (mode === 'none') return undefined
  if (mode === 'custom') {
    const url = normalizeProxyUrlInput(provider?.url)
    return url && isValidProxyUrl(url) ? url : undefined
  }
  if (system?.enabled) {
    const url = normalizeProxyUrlInput(system.url)
    if (url && isValidProxyUrl(url)) return url
  }
  return undefined
}

/**
 * Map provider + system proxy settings to an outboundFetch `proxyUrl` init value.
 * - `none` → `false` (force direct, ignore process default)
 * - `custom` → validated URL, or `false` if missing/invalid
 * - `inherit` → system URL when enabled, otherwise `undefined` (process default)
 */
export function resolveOutboundProxyInit(
  provider: ProviderProxySettings | undefined | null,
  system: SystemProxySettings | undefined | null,
): string | false | undefined {
  const mode = normalizeProviderProxyMode(provider?.mode)
  if (mode === 'none') return false
  if (mode === 'custom') {
    const url = normalizeProxyUrlInput(provider?.url)
    return url && isValidProxyUrl(url) ? url : false
  }
  return resolveEffectiveProxyUrl(provider, system)
}

/** Mask credentials in proxy URL for logs / previews. */
export function maskProxyUrlForDisplay(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.password || parsed.username) {
      parsed.username = parsed.username ? '***' : ''
      parsed.password = parsed.password ? '***' : ''
    }
    return parsed.toString()
  } catch {
    return trimmed.replace(/\/\/[^@/]+@/, '//***@')
  }
}
