import http from 'node:http'
import https from 'node:https'
import {
  ensureOutboundNetworkReady,
  getConnectFamiliesForHost,
  isOutboundConnectError,
  noteHostConnectFailure,
  noteHostConnectSuccess,
  type OutboundConnectFamily,
} from './outbound-network.js'

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

function outboundFetchOnce(
  url: string,
  init: RequestInit,
  family: OutboundConnectFamily,
): Promise<Response> {
  const parsed = new URL(url)
  const isHttps = parsed.protocol === 'https:'
  const lib = isHttps ? https : http
  const method = init.method ?? 'GET'
  const headers = normalizeHeaders(init.headers)
  const payload = bodyBytes(init.body)

  return new Promise((resolve, reject) => {
    const signal = init.signal
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        family,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          resolve(new Response(Buffer.concat(chunks), {
            status: res.statusCode ?? 500,
            statusText: res.statusMessage,
            headers: Object.fromEntries(
              Object.entries(res.headers).flatMap(([key, value]) =>
                value == null ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]],
              ),
            ),
          }))
        })
        res.on('error', reject)
      },
    )

    req.on('error', reject)

    const onAbort = () => {
      req.destroy(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    req.on('close', () => signal?.removeEventListener('abort', onAbort))

    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Outbound HTTP(S) fetch: IPv4 first per host; retry IPv6 only after v4 connect/DNS failure.
 */
export async function outboundFetch(url: string, init: RequestInit = {}): Promise<Response> {
  await ensureOutboundNetworkReady()
  const hostname = new URL(url).hostname
  const families = getConnectFamiliesForHost(hostname)

  let lastError: unknown
  for (const family of families) {
    try {
      const response = await outboundFetchOnce(url, init, family)
      noteHostConnectSuccess(hostname, family)
      return response
    } catch (error) {
      if (init.signal?.aborted) throw error
      if (!isOutboundConnectError(error)) throw error
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
  if (error.name === 'AbortError' || error.message === 'Aborted') {
    return '请求超时，请稍后重试'
  }
  return error.message || '请求失败'
}
