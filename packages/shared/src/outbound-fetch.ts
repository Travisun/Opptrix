import http from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
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
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        family,
      },
      (res) => {
        // 响应头到达即 resolve，body 用可读流 — 禁止整包缓冲后再给调用方
        const webBody = Readable.toWeb(res) as ReadableStream<Uint8Array>
        settleResolve(new Response(webBody, {
          status: res.statusCode ?? 500,
          statusText: res.statusMessage,
          headers: responseHeadersFromIncoming(res),
        }))
      },
    )

    req.on('error', (error) => {
      // 已 resolve（流式读 body）后 destroy/abort 只影响 body，勿再 reject Promise
      settleReject(error)
    })

    const onAbort = () => {
      const reason = abortRejectReason(signal)
      req.destroy(reason)
      // 尚未拿到响应头：以 abort reason 结束（含 TimeoutError，由 formatOutboundFetchError 转中文）
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
  if (isOutboundTimeoutError(error)) {
    return '请求超时，请稍后重试'
  }
  if (error.name === 'AbortError' || error.message === 'Aborted') {
    return '请求超时，请稍后重试'
  }
  return error.message || '请求失败'
}
