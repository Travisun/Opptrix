/**
 * Trusted-proxy + local-only access helpers.
 *
 * Env:
 * - OPPTRIX_TRUSTED_PROXIES — comma-separated CIDR/IPs of reverse proxies.
 *   Empty (default) → never trust forwarded client headers.
 * - OPPTRIX_TRUSTED_LOCAL_CIDRS — extra CIDRs treated as local (loopback always).
 *
 * Client IP (only when peer ∈ trustedProxies), priority:
 * CF-Connecting-IP → True-Client-IP → X-Real-IP → leftmost X-Forwarded-For → peer.
 * Non-trusted peers always use the socket peer (header spoofing cannot become “local”).
 */
import type { IncomingHttpHeaders } from 'node:http'

export type AccessGate = 'open' | 'auth_required' | 'local_only_deny'

export interface ClientIpRequest {
  ip: string
  headers: IncomingHttpHeaders
}

export interface TrustedClientOpts {
  trustedProxies?: string[]
  trustedLocalCidrs?: string[]
}

const LOOPBACK_CIDRS = ['127.0.0.0/8', '::1/128']

export function parseCidrList(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function trustedProxiesFromEnv(): string[] {
  return parseCidrList(process.env.OPPTRIX_TRUSTED_PROXIES)
}

export function trustedLocalCidrsFromEnv(): string[] {
  return parseCidrList(process.env.OPPTRIX_TRUSTED_LOCAL_CIDRS)
}

export function normalizeIp(ip: string): string {
  let s = ip.trim()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  if (s.startsWith('::ffff:')) {
    const v4 = s.slice('::ffff:'.length)
    if (isIpv4(v4)) return v4
  }
  return s
}

function isIpv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

function ipv4ToInt(ip: string): number | null {
  if (!isIpv4(ip)) return null
  const parts = ip.split('.')
  let n = 0
  for (const part of parts) n = (n << 8) | Number(part)
  return n >>> 0
}

function expandIpv6(ip: string): bigint | null {
  const lower = ip.toLowerCase()
  if (lower.includes('.')) return null
  const parts = lower.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':').filter(Boolean) : []
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':').filter(Boolean) : []
  if (head.some(h => !/^[0-9a-f]{1,4}$/.test(h))) return null
  if (tail.some(h => !/^[0-9a-f]{1,4}$/.test(h))) return null
  const missing = 8 - head.length - tail.length
  if (missing < 0) return null
  if (parts.length === 1 && missing !== 0) return null
  const groups = [
    ...head,
    ...Array.from({ length: parts.length === 2 ? missing : 0 }, () => '0'),
    ...tail,
  ]
  if (groups.length !== 8) return null
  let n = 0n
  for (const g of groups) n = (n << 16n) + BigInt(parseInt(g, 16))
  return n
}

function parseCidr(cidr: string): { kind: 'v4' | 'v6'; network: bigint; bits: number } | null {
  const spec = cidr.trim()
  const slash = spec.indexOf('/')
  const addr = slash >= 0 ? spec.slice(0, slash) : spec
  const ip = normalizeIp(addr)
  if (isIpv4(ip)) {
    const bits = slash >= 0 ? Number(spec.slice(slash + 1)) : 32
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null
    const n = ipv4ToInt(ip)
    if (n == null) return null
    const mask = bits === 0 ? 0 : bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0
    return { kind: 'v4', network: BigInt(n & mask), bits }
  }
  const v6 = expandIpv6(ip)
  if (v6 == null) return null
  const bits = slash >= 0 ? Number(spec.slice(slash + 1)) : 128
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) return null
  const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(128 - bits)
  return { kind: 'v6', network: v6 & mask, bits }
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr)
  const addr = normalizeIp(ip)
  if (!parsed) return false
  if (parsed.kind === 'v4') {
    const n = ipv4ToInt(addr)
    if (n == null) return false
    const mask = parsed.bits === 0
      ? 0
      : parsed.bits === 32
        ? 0xffffffff
        : (~((1 << (32 - parsed.bits)) - 1)) >>> 0
    return BigInt(n & mask) === parsed.network
  }
  const v6 = expandIpv6(addr)
  if (v6 == null) return false
  const mask = parsed.bits === 0
    ? 0n
    : ((1n << BigInt(parsed.bits)) - 1n) << BigInt(128 - parsed.bits)
  return (v6 & mask) === parsed.network
}

export function ipMatchesAny(ip: string, cidrs: readonly string[]): boolean {
  return cidrs.some(c => ipMatchesCidr(ip, c))
}

export function isIpLocal(ip: string, extraLocalCidrs: readonly string[] = trustedLocalCidrsFromEnv()): boolean {
  const addr = normalizeIp(ip)
  if (!addr) return false
  return ipMatchesAny(addr, [...LOOPBACK_CIDRS, ...extraLocalCidrs])
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return undefined
}

function firstValidIpFromList(raw: string | undefined): string | null {
  if (!raw) return null
  for (const part of raw.split(',')) {
    const ip = normalizeIp(part)
    if (isIpv4(ip) || expandIpv6(ip) != null) return ip
  }
  return null
}

export function resolveClientIp(
  req: ClientIpRequest,
  opts?: TrustedClientOpts,
): string {
  const peer = normalizeIp(req.ip)
  const proxies = opts?.trustedProxies ?? trustedProxiesFromEnv()
  if (!peer || proxies.length === 0 || !ipMatchesAny(peer, proxies)) return peer

  const fromCf = firstValidIpFromList(headerValue(req.headers, 'cf-connecting-ip'))
  if (fromCf) return fromCf
  const fromTrueClient = firstValidIpFromList(headerValue(req.headers, 'true-client-ip'))
  if (fromTrueClient) return fromTrueClient
  const fromRealIp = firstValidIpFromList(headerValue(req.headers, 'x-real-ip'))
  if (fromRealIp) return fromRealIp
  const fromXff = firstValidIpFromList(headerValue(req.headers, 'x-forwarded-for'))
  if (fromXff) return fromXff
  return peer
}

export function isTrustedLocalAccess(
  clientIp: string,
  peerIp: string,
  opts?: TrustedClientOpts,
): boolean {
  const extra = opts?.trustedLocalCidrs ?? trustedLocalCidrsFromEnv()
  if (isIpLocal(clientIp, extra)) return true
  const proxies = opts?.trustedProxies ?? trustedProxiesFromEnv()
  if (proxies.length > 0 && ipMatchesAny(normalizeIp(peerIp), proxies) && isIpLocal(clientIp, extra)) {
    return true
  }
  return false
}

/**
 * Claimed → login required for all clients.
 * Unclaimed + local → open.
 * Unclaimed + remote → deny (403), not a login prompt.
 */
export function evaluateAccessGate(claimed: boolean, clientIsLocal: boolean): AccessGate {
  if (!claimed) return clientIsLocal ? 'open' : 'local_only_deny'
  return 'auth_required'
}

export function authRequired(claimed: boolean, clientIsLocal: boolean): boolean {
  return evaluateAccessGate(claimed, clientIsLocal) === 'auth_required'
}
