import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  isDesktopRuntime,
  ipMatchesAny,
  normalizeIp,
  trustedProxiesFromEnv,
} from '@opptrix/shared'

export const SESSION_COOKIE = 'opptrix_session'

export function requestPath(req: FastifyRequest): string {
  const raw = req.url ?? '/'
  const q = raw.indexOf('?')
  let pathOnly = q === -1 ? raw : raw.slice(0, q)
  // The router (find-my-way) matches the percent-DECODED path, so auth prefix
  // checks must decode too — `/%61pi/…` is `/api/…` to the router and must not
  // bypass `/api`-scoped auth. Malformed encoding keeps the raw path (the
  // router will reject it — fail-closed).
  try {
    pathOnly = decodeURIComponent(pathOnly)
  } catch {
    // keep raw
  }
  // Normalize dot segments and collapse duplicate slashes (conservative:
  // over-normalizing only widens auth coverage, never narrows it).
  const segments = pathOnly.split('/')
  const out: string[] = []
  for (const seg of segments) {
    if (seg === '.') continue
    if (seg === '..') {
      if (out.length > 1) out.pop()
      continue
    }
    out.push(seg)
  }
  return out.join('/').replace(/\/{2,}/g, '/')
}

export function peerIpOf(req: FastifyRequest): string {
  return normalizeIp(req.socket.remoteAddress ?? req.ip ?? '')
}

function headerString(req: FastifyRequest, name: string): string {
  const raw = req.headers[name]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return ''
}

export function isDesktopClient(req: FastifyRequest): boolean {
  if (isDesktopRuntime()) return true
  return headerString(req, 'x-opptrix-client').trim().toLowerCase() === 'desktop'
}

export function cookieSecure(req: FastifyRequest): boolean {
  if (process.env.OPPTRIX_AUTH_COOKIE_SECURE?.trim() === '1') return true
  const peer = peerIpOf(req)
  const proxies = trustedProxiesFromEnv()
  if (proxies.length > 0 && ipMatchesAny(peer, proxies)) {
    const proto = headerString(req, 'x-forwarded-proto').split(',')[0]?.trim().toLowerCase()
    if (proto === 'https') return true
  }
  return req.protocol === 'https'
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    const val = part.slice(eq + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(val)
    } catch {
      out[key] = val
    }
  }
  return out
}

export function readSessionToken(req: FastifyRequest): string | null {
  const cookies = parseCookies(req.headers.cookie)
  const fromCookie = cookies[SESSION_COOKIE]?.trim()
  if (fromCookie) return fromCookie
  const auth = headerString(req, 'authorization')
  const m = /^Bearer\s+(\S+)/i.exec(auth)
  const bearer = m?.[1]?.trim()
  return bearer || null
}

export function setSessionCookie(
  req: FastifyRequest,
  reply: FastifyReply,
  token: string,
  expiresAt: string,
): void {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (cookieSecure(req)) parts.push('Secure')
  reply.header('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(req: FastifyRequest, reply: FastifyReply): void {
  const parts = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (cookieSecure(req)) parts.push('Secure')
  reply.header('Set-Cookie', parts.join('; '))
}

export function clientLabel(req: FastifyRequest): string {
  const ua = headerString(req, 'user-agent')
  if (!ua) return isDesktopClient(req) ? 'Desktop' : 'Web'
  return ua.slice(0, 80)
}
