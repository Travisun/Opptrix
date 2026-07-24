import { createHash } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { formatOutboundFetchError } from '@opptrix/shared'
import { SsrfBlockedError } from './errors.js'
import { assertAllowedHost, assertAllowedProtocol } from './ssrf.js'

export type HttpBodyEncoding = 'utf8' | 'base64'
export type HttpResponseType = 'text' | 'json' | 'bytes_meta'

export interface HttpFetchParams {
  method?: string
  url: string
  headers?: Record<string, string>
  query?: Record<string, string | number | boolean>
  body?: string
  body_encoding?: HttpBodyEncoding
  timeout_ms?: number
  follow_redirects?: boolean
  max_redirects?: number
  response_type?: HttpResponseType
  max_response_bytes?: number
  signal?: AbortSignal
}

export interface HttpFetchResult {
  ok: boolean
  status: number
  status_text: string
  url: string
  headers: Record<string, string>
  response_type: HttpResponseType
  body?: string
  json?: unknown
  bytes_meta?: {
    size: number
    truncated: boolean
    sha256_prefix?: string
  }
  error?: string
}

const DEFAULT_MAX_RESPONSE = 1_500_000
const DEFAULT_MAX_BODY = 32 * 1024 * 1024
const DEFAULT_TIMEOUT = 30_000
const DEFAULT_MAX_REDIRECTS = 5

function buildUrl(base: URL, query?: Record<string, string | number | boolean>): string {
  if (!query || !Object.keys(query).length) return base.href
  const u = new URL(base.href)
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, String(v))
  }
  return u.href
}

function decodeBody(body: string | undefined, encoding: HttpBodyEncoding): Buffer | undefined {
  if (body == null || body === '') return undefined
  if (encoding === 'base64') return Buffer.from(body, 'base64')
  return Buffer.from(body, 'utf8')
}

function normalizeHeaders(raw?: Record<string, string>): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v != null) out[k] = String(v)
  }
  return out
}

function hashPrefix(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

function fetchOnce(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: Buffer; signal?: AbortSignal; timeoutMs: number },
): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: Buffer; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    assertAllowedProtocol(parsed)
    const lib = parsed.protocol === 'https:' ? https : http
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), init.timeoutMs)
    const onAbort = () => controller.abort()
    init.signal?.addEventListener('abort', onAbort, { once: true })

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method,
        headers: init.headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          clearTimeout(timer)
          init.signal?.removeEventListener('abort', onAbort)
          resolve({
            status: res.statusCode ?? 500,
            statusText: res.statusMessage ?? '',
            headers: Object.fromEntries(
              Object.entries(res.headers).flatMap(([k, v]) =>
                v == null ? [] : [[k, Array.isArray(v) ? v.join(', ') : String(v)]],
              ),
            ),
            body: Buffer.concat(chunks),
            finalUrl: url,
          })
        })
        res.on('error', reject)
      },
    )
    req.on('error', err => {
      clearTimeout(timer)
      init.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    controller.signal.addEventListener('abort', () => {
      req.destroy(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
    if (init.body) req.write(init.body)
    req.end()
  })
}

export async function httpFetch(params: HttpFetchParams): Promise<HttpFetchResult> {
  const method = (params.method ?? 'GET').toUpperCase()
  const timeoutMs = params.timeout_ms ?? DEFAULT_TIMEOUT
  const maxResponse = params.max_response_bytes ?? DEFAULT_MAX_RESPONSE
  const maxRedirects = params.max_redirects ?? DEFAULT_MAX_REDIRECTS
  const follow = params.follow_redirects !== false
  const responseType = params.response_type ?? 'text'
  const encoding = params.body_encoding ?? 'utf8'

  let parsed: URL
  try {
    parsed = new URL(params.url.trim())
    await assertAllowedHost(parsed)
  } catch (e) {
    return {
      ok: false,
      status: 0,
      status_text: '',
      url: params.url,
      headers: {},
      response_type: responseType,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  const payload = decodeBody(params.body, encoding)
  if (payload && payload.length > DEFAULT_MAX_BODY) {
    return {
      ok: false,
      status: 0,
      status_text: '',
      url: parsed.href,
      headers: {},
      response_type: responseType,
      error: `请求体超过 ${DEFAULT_MAX_BODY} 字节上限`,
    }
  }

  const headers = normalizeHeaders(params.headers)
  let currentUrl = buildUrl(parsed, params.query)
  let redirects = 0
  let lastStatus = 0
  let lastStatusText = ''
  let lastHeaders: Record<string, string> = {}
  let bodyBuf: Buffer = Buffer.alloc(0)

  while (true) {
    if (params.signal?.aborted) {
      return {
        ok: false,
        status: 0,
        status_text: '',
        url: currentUrl,
        headers: {},
        response_type: responseType,
        error: '已取消',
      }
    }

    try {
      await assertAllowedHost(new URL(currentUrl))
    } catch (e) {
      return {
        ok: false,
        status: 0,
        status_text: '',
        url: currentUrl,
        headers: {},
        response_type: responseType,
        error: e instanceof Error ? e.message : String(e),
      }
    }

    try {
      const res = await fetchOnce(currentUrl, {
        method,
        headers,
        body: redirects === 0 ? payload : undefined,
        signal: params.signal,
        timeoutMs,
      })
      lastStatus = res.status
      lastStatusText = res.statusText
      lastHeaders = res.headers
      bodyBuf = Buffer.from(new Uint8Array(res.body))
      currentUrl = res.finalUrl

      if (
        follow
        && [301, 302, 303, 307, 308].includes(res.status)
        && res.headers.location
      ) {
        if (redirects >= maxRedirects) {
          return {
            ok: false,
            status: res.status,
            status_text: res.statusText,
            url: currentUrl,
            headers: lastHeaders,
            response_type: responseType,
            error: '重定向次数过多',
          }
        }
        redirects++
        const next = new URL(res.headers.location, currentUrl)
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          throw new SsrfBlockedError('重定向目标协议不允许')
        }
        currentUrl = next.href
        continue
      }
      break
    } catch (e) {
      return {
        ok: false,
        status: 0,
        status_text: '',
        url: currentUrl,
        headers: {},
        response_type: responseType,
        error: formatOutboundFetchError(e),
      }
    }
  }

  const truncated = bodyBuf.length > maxResponse
  const slice = truncated ? Buffer.from(bodyBuf.subarray(0, maxResponse)) : bodyBuf
  const ok = lastStatus >= 200 && lastStatus < 300

  const base: HttpFetchResult = {
    ok,
    status: lastStatus,
    status_text: lastStatusText,
    url: currentUrl,
    headers: lastHeaders,
    response_type: responseType,
  }

  if (responseType === 'bytes_meta') {
    return {
      ...base,
      bytes_meta: {
        size: bodyBuf.length,
        truncated,
        sha256_prefix: hashPrefix(slice),
      },
    }
  }

  const text = slice.toString('utf8')
  if (responseType === 'json') {
    try {
      return { ...base, json: JSON.parse(text) as unknown, body: truncated ? `${text}\n…(已截断)` : text }
    } catch {
      return { ...base, error: '响应不是有效 JSON', body: text }
    }
  }

  return {
    ...base,
    body: truncated ? `${text}\n…(已截断，共 ${bodyBuf.length} 字节)` : text,
  }
}
