import dns from 'node:dns/promises'
import net from 'node:net'
import { SsrfBlockedError } from './errors.js'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
])

const METADATA_IPS = new Set(['169.254.169.254', '100.100.100.200'])

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

function isBlockedIp(ip: string): boolean {
  if (METADATA_IPS.has(ip)) return true
  const ver = net.isIP(ip)
  if (ver === 4) return isPrivateIpv4(ip)
  if (ver === 6) return isPrivateIpv6(ip)
  return false
}

export function assertAllowedProtocol(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError('仅支持 http 与 https')
  }
}

export async function assertAllowedHost(
  url: URL,
  opts?: { allowLan?: boolean },
): Promise<void> {
  assertAllowedProtocol(url)
  const host = url.hostname.toLowerCase()
  if (!host) throw new SsrfBlockedError('无效主机名')

  if (METADATA_IPS.has(host)) {
    throw new SsrfBlockedError('不允许访问私有或本地网络地址')
  }

  if (!opts?.allowLan) {
    if (BLOCKED_HOSTNAMES.has(host)) throw new SsrfBlockedError('不允许访问本地地址')
    if (host.endsWith('.localhost') || host.endsWith('.local')) {
      throw new SsrfBlockedError('不允许访问本地地址')
    }

    if (net.isIP(host)) {
      if (isBlockedIp(host)) throw new SsrfBlockedError('不允许访问私有或本地网络地址')
      return
    }

    let addresses: Array<{ address: string }>
    try {
      addresses = await dns.lookup(host, { all: true, verbatim: true })
    } catch {
      throw new SsrfBlockedError('无法解析主机名')
    }
    if (!addresses.length) throw new SsrfBlockedError('无法解析主机名')
    for (const { address } of addresses) {
      if (isBlockedIp(address)) {
        throw new SsrfBlockedError('不允许访问私有或本地网络地址')
      }
    }
    return
  }

  if (net.isIP(host)) return

  try {
    await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new SsrfBlockedError('无法解析主机名')
  }
}

export async function assertAllowedUrl(raw: string): Promise<URL> {
  const trimmed = raw.trim()
  if (!trimmed) throw new SsrfBlockedError('URL 不能为空')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new SsrfBlockedError('URL 格式无效')
  }
  await assertAllowedHost(parsed)
  return parsed
}
