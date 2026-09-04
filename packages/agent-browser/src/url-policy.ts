import dns from 'node:dns/promises'
import net from 'node:net'

export class UrlPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UrlPolicyError'
  }
}

const BLOCKED_PREFIXES = [
  'file:',
  'javascript:',
  'data:',
  'blob:',
  'about:',
] as const

/** Align with packages/agent-workspace/src/ssrf.ts hostname denylist (sync path). */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
])

const METADATA_IPS = new Set(['169.254.169.254', '100.100.100.200'])

/** Injectable DNS lookup for tests (matches `dns.promises.lookup` with `{ all: true }`). */
export type DnsLookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family?: number }>>

export type AssertAllowedUrlAsyncOpts = {
  /** When true, skip private/LAN rejection (still block weird schemes; metadata IP literals blocked). */
  allowLan?: boolean
  /** Override DNS resolution (tests). Defaults to `dns.lookup`. */
  lookup?: DnsLookupFn
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
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
  if (v4Mapped?.[1]) return isPrivateIpv4(v4Mapped[1])
  return false
}

function isBlockedIp(ip: string): boolean {
  if (METADATA_IPS.has(ip)) return true
  const ver = net.isIP(ip)
  if (ver === 4) return isPrivateIpv4(ip)
  if (ver === 6) return isPrivateIpv6(ip)
  return false
}

function normalizeHostname(url: URL): string {
  let host = url.hostname.toLowerCase()
  // Node may keep brackets on IPv6 hostnames (e.g. `[::1]`).
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1)
  }
  return host
}

/** Sync hostname / literal-IP SSRF baseline (no DNS lookup). */
function assertAllowedHostSync(url: URL): void {
  const host = normalizeHostname(url)
  if (!host) {
    throw new UrlPolicyError('Invalid hostname')
  }

  if (METADATA_IPS.has(host)) {
    throw new UrlPolicyError('Private or link-local addresses are not allowed')
  }

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new UrlPolicyError('Local addresses are not allowed')
  }
  if (host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new UrlPolicyError('Local addresses are not allowed')
  }

  if (net.isIP(host) && isBlockedIp(host)) {
    throw new UrlPolicyError('Private or link-local addresses are not allowed')
  }
}

/** Parse + scheme checks only (shared by sync/async). */
function parseHttpUrl(raw: string): URL {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new UrlPolicyError('URL is required')
  }

  const lower = trimmed.toLowerCase()
  for (const prefix of BLOCKED_PREFIXES) {
    if (lower.startsWith(prefix)) {
      throw new UrlPolicyError(`URL protocol is not allowed: ${prefix}`)
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new UrlPolicyError('Invalid URL format')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlPolicyError('Only http and https URLs are allowed')
  }

  return parsed
}

export function assertAllowedUrl(raw: string): URL {
  const parsed = parseHttpUrl(raw)
  assertAllowedHostSync(parsed)
  return parsed
}

/**
 * Async URL policy: sync baseline + DNS resolution for non-IP hostnames.
 * Aligns with packages/agent-workspace/src/ssrf.ts `assertAllowedHost`.
 */
export async function assertAllowedUrlAsync(
  raw: string,
  opts?: AssertAllowedUrlAsyncOpts,
): Promise<URL> {
  const allowLan = opts?.allowLan === true
  const lookup: DnsLookupFn = opts?.lookup
    ?? ((hostname, options) => dns.lookup(hostname, options))

  if (!allowLan) {
    const parsed = assertAllowedUrl(raw)
    const host = normalizeHostname(parsed)
    if (net.isIP(host)) return parsed

    let addresses: Array<{ address: string }>
    try {
      addresses = await lookup(host, { all: true, verbatim: true })
    } catch {
      throw new UrlPolicyError('Unable to resolve hostname')
    }
    if (!addresses.length) {
      throw new UrlPolicyError('Unable to resolve hostname')
    }
    for (const { address } of addresses) {
      if (isBlockedIp(address)) {
        throw new UrlPolicyError('Private or link-local addresses are not allowed')
      }
    }
    return parsed
  }

  // allowLan: scheme checks + metadata IP literal; skip private/LAN host denylist.
  const parsed = parseHttpUrl(raw)
  const host = normalizeHostname(parsed)
  if (!host) {
    throw new UrlPolicyError('Invalid hostname')
  }
  if (METADATA_IPS.has(host)) {
    throw new UrlPolicyError('Private or link-local addresses are not allowed')
  }
  if (net.isIP(host)) return parsed

  try {
    await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new UrlPolicyError('Unable to resolve hostname')
  }
  return parsed
}

export function normalizeUrl(raw: string): string {
  return assertAllowedUrl(raw).href
}

export async function normalizeUrlAsync(
  raw: string,
  opts?: AssertAllowedUrlAsyncOpts,
): Promise<string> {
  return (await assertAllowedUrlAsync(raw, opts)).href
}
