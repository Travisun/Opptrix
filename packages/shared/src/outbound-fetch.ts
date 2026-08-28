import http from 'node:http'
import https from 'node:https'
import type { Agent } from 'node:http'
import { Readable } from 'node:stream'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import {
  ensureOutboundNetworkReady,
  getConnectFamiliesForHost,
  isOutboundConnectError,
  noteHostConnectFailure,
  noteHostConnectSuccess,
  type OutboundConnectFamily,
} from './outbound-network.js'
import { isValidProxyUrl, normalizeProxyUrlInput } from './proxy-config.js'

export type OutboundFetchInit = RequestInit & {
  /**
   * Outbound proxy for this request:
   * - `string` — use that proxy
   * - `false` — force direct (ignore process default)
   * - `undefined` — use process default when set
   */
  proxyUrl?: string | false
}

const proxyAgentCache = new Map<string, Agent>()

let defaultOutboundProxyUrl: string | undefined

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.localhost')
}

/** Set process-wide default outbound proxy. Invalid/empty clears. */
export function setDefaultOutboundProxyUrl(url: string | undefined | null): void {
  const raw = normalizeProxyUrlInput(url)
  defaultOutboundProxyUrl = raw && isValidProxyUrl(raw) ? raw : undefined
}

export function getDefaultOutboundProxyUrl(): string | undefined {
  return defaultOutboundProxyUrl
}

/** Apply Settings → 网络代理 (`system_proxy`) as the process default. */
export function applySystemProxyAsDefault(
  system: { enabled: boolean; url?: string } | null | undefined,
): void {
  if (system?.enabled) {
    setDefaultOutboundProxyUrl(system.url)
    return
  }
  setDefaultOutboundProxyUrl(undefined)
}

/** @internal tests only */
export function resetDefaultOutboundProxyUrlForTests(): void {
  defaultOutboundProxyUrl = undefined
}

/**
 * Resolve the proxy URL actually used for a request.
 * Loopback hosts skip the process default; an explicit `string` still applies.
 */
export function resolveEffectiveOutboundProxyUrl(
  init: Pick<OutboundFetchInit, 'proxyUrl'> = {},
  hostname = '',
): string | undefined {
  if (init.proxyUrl === false) return undefined

  const explicit = typeof init.proxyUrl === 'string'
    ? normalizeProxyUrlInput(init.proxyUrl)
    : null
  if (explicit) {
    return isValidProxyUrl(explicit) ? explicit : undefined
  }

  const fallback = defaultOutboundProxyUrl
  if (!fallback) return undefined
  if (hostname && isLoopbackHostname(hostname)) return undefined
  return fallback
}

function proxyAgentFor(url: string): Agent {
  let agent = proxyAgentCache.get(url)
  if (!agent) {
    const scheme = new URL(url).protocol.replace(':', '').toLowerCase()
    agent = (scheme === 'socks5' || scheme === 'socks4')
      ? new SocksProxyAgent(url)
      : new HttpsProxyAgent(url)
    proxyAgentCache.set(url, agent)
  }
  return agent
}

/** @internal tests only */
export function resetOutboundProxyAgentCacheForTests(): void {
  proxyAgentCache.clear()
}

function normalizeHeaders(headers?: RequestInit['headers']): Record<string, string> {
  if (!headers) return {}
  const out: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => { out[key] = value })
    return out
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value
    return out
  }
  for (const [key, value] of Object.entries(headers as Record<string, string | readonly string[] | undefined>)) {
    if (value == null) continue
    out[key] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}

function bodyBytes(body: RequestInit['body']): Buffer | undefined {
  if (body == null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof Uint8Array) return Buffer.from(body)
  throw new Error('unsupported request body type')
}

function responseHeadersFromIncoming(res: http.IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    Object.entries(res.headers).flatMap(([key, value]) =>
      value == null ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]],
    ),
  )
}

/** TimeoutError / AbortSignal.timeout 原文勿直接展示给用户 */
export function isOutboundTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'TimeoutError') return true
  return error.message.toLowerCase().includes('aborted due to timeout')
}

function abortRejectReason(signal: AbortSignal | null | undefined): Error {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  return new DOMException('Aborted', 'AbortError')
}

function outboundFetchOnce(
  url: string,
  init: RequestInit,
  family: OutboundConnectFamily,
  proxyUrl?: string,
): Promise<Response> {
  const parsed = new URL(url)
  const isHttps = parsed.protocol === 'https:'
  const lib = isHttps ? https : http
  const method = init.method ?? 'GET'
  const headers = normalizeHeaders(init.headers)
  const payload = bodyBytes(init.body)
  const agent = proxyUrl ? proxyAgentFor(proxyUrl) : undefined

  const requestOptions: https.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: `${parsed.pathname}${parsed.search}`,
    method,
    headers,
    ...(agent ? { agent } : { family }),
  }

  return new Promise((resolve, reject) => {
    const signal = init.signal
    if (signal?.aborted) {
      reject(abortRejectReason(signal))
      return
    }

    let settled = false
    const settleReject = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const settleResolve = (response: Response) => {
      if (settled) return
      settled = true
      resolve(response)
    }

    const req = lib.request(
      requestOptions,
      (res) => {
        const webBody = Readable.toWeb(res) as ReadableStream<Uint8Array>
        settleResolve(new Response(webBody, {
          status: res.statusCode ?? 500,
          statusText: res.statusMessage,
          headers: responseHeadersFromIncoming(res),
        }))
      },
    )

    req.on('error', (error) => {
      settleReject(error)
    })

    const onAbort = () => {
      const reason = abortRejectReason(signal)
      req.destroy(reason)
      settleReject(reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    req.on('close', () => signal?.removeEventListener('abort', onAbort))

    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Outbound HTTP(S) fetch: IPv4 first per host; retry IPv6 only after v4 connect/DNS failure.
 * 一旦响应头到达并开始流式 body，不再换栈重放。
 * With a resolved proxy URL, traffic routes through HTTP/HTTPS/SOCKS (no dual-stack retry).
 */
export async function outboundFetch(url: string, init: OutboundFetchInit = {}): Promise<Response> {
  await ensureOutboundNetworkReady()
  const { proxyUrl: proxyOpt, ...fetchInit } = init
  const hostname = new URL(url).hostname
  const proxyUrl = resolveEffectiveOutboundProxyUrl({ proxyUrl: proxyOpt }, hostname)
  const families: OutboundConnectFamily[] = proxyUrl ? [4] : getConnectFamiliesForHost(hostname)

  let lastError: unknown
  for (const family of families) {
    try {
      const response = await outboundFetchOnce(url, fetchInit, family, proxyUrl)
      if (!proxyUrl) noteHostConnectSuccess(hostname, family)
      return response
    } catch (error) {
      if (fetchInit.signal?.aborted) throw error
      if (proxyUrl || !isOutboundConnectError(error)) throw error
      noteHostConnectFailure(hostname, family)
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function formatOutboundFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  if (isOutboundConnectError(error)) {
    return '无法连接远程服务，请检查网络与代理设置'
  }
  if (isOutboundTimeoutError(error)) {
    return '请求超时，请稍后重试'
  }
  if (error.name === 'AbortError' || error.message === 'Aborted') {
    return '请求超时，请稍后重试'
  }
  return error.message || '请求失败'
}
