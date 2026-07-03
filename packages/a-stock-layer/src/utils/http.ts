export const HTTP_DEFAULT_HEADERS = {
  'User-Agent': (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ),
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://quote.eastmoney.com/',
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Build `sdk-key` auth header for Zzshare / 自在量化 API */
export function sdkKeyHeaders(token: string): Record<string, string> {
  const key = token.trim()
  return key ? { 'sdk-key': key } : {}
}

export interface HttpFetchResponse {
  status: number
  headers: Headers
  json(): Promise<Record<string, unknown>>
  text(): Promise<string>
}

/**
 * GET with 429 backoff (Retry-After + exponential) — mirrors zzshare Python `_request_with_retry`.
 * Returns raw status so callers can handle 401/429 without throwing.
 */
export async function httpGetWithRetry(
  url: string,
  params: Record<string, string> = {},
  options: {
    timeoutMs?: number
    extraHeaders?: Record<string, string>
    maxRetries?: number
  } = {},
): Promise<HttpFetchResponse> {
  const timeoutMs = options.timeoutMs ?? 15000
  const maxRetries = options.maxRetries ?? 3
  const headers = { ...HTTP_DEFAULT_HEADERS, ...options.extraHeaders }
  const qs = new URLSearchParams(params)
  const fullUrl = qs.toString() ? `${url}?${qs}` : url

  let retries = 0
  let backoff = 2

  while (true) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(fullUrl, { headers, signal: controller.signal })
      if (resp.status === 429) {
        retries += 1
        if (retries > maxRetries) return wrapFetchResponse(resp)
        const retryAfter = resp.headers.get('Retry-After')
        let sleepTime = backoff
        if (retryAfter) {
          const parsed = Number.parseFloat(retryAfter)
          sleepTime = Number.isFinite(parsed) ? parsed + 0.5 : backoff
          if (!Number.isFinite(parsed)) backoff *= 2
        } else {
          backoff *= 2
        }
        await sleep(sleepTime * 1000)
        continue
      }
      return wrapFetchResponse(resp)
    } catch (e) {
      if (retries >= maxRetries) throw e instanceof Error ? e : new Error(String(e))
      retries += 1
      await sleep(backoff * 1000)
      backoff *= 2
    } finally {
      clearTimeout(timer)
    }
  }
}

function wrapFetchResponse(resp: Response): HttpFetchResponse {
  return {
    status: resp.status,
    headers: resp.headers,
    json: () => resp.json() as Promise<Record<string, unknown>>,
    text: () => resp.text(),
  }
}

/** GET with retry — mirrors Python aaashare http_client (no proxy, 2 retries) */
export async function httpGet(
  url: string,
  params: Record<string, string>,
  timeoutMs = 15000,
  extraHeaders: Record<string, string> = {},
) {
  const qs = new URLSearchParams(params)
  const fullUrl = `${url}?${qs}`
  let lastError = ''
  const headers = { ...HTTP_DEFAULT_HEADERS, ...extraHeaders }

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(fullUrl, { headers, signal: controller.signal })
      if (!resp.ok) {
        if (RETRY_STATUS.has(resp.status) && attempt < 2) {
          await sleep(1000 * (attempt + 1))
          continue
        }
        throw new Error(`HTTP ${resp.status}`)
      }
      const ct = resp.headers.get('content-type') ?? ''
      if (ct.includes('json')) return resp.json() as Promise<Record<string, unknown>>
      const text = await resp.text()
      if (text.trimStart().startsWith('<')) throw new Error('HTML response')
      try {
        return JSON.parse(text) as Record<string, unknown>
      } catch {
        throw new Error('Invalid JSON')
      }
    } catch (e) {
      lastError = String(e)
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(lastError || 'request failed')
}

/** GET returning raw text (HTML, etc.) */
export async function httpGetText(
  url: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15000,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      headers: { ...HTTP_DEFAULT_HEADERS, ...extraHeaders },
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.text()
  } finally {
    clearTimeout(timer)
  }
}

/** POST application/json → JSON */
export async function httpPost(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...HTTP_DEFAULT_HEADERS,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.json() as Promise<Record<string, unknown>>
  } finally {
    clearTimeout(timer)
  }
}

/** POST application/x-www-form-urlencoded → JSON */
export async function httpPostForm(
  url: string,
  data: Record<string, string>,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...HTTP_DEFAULT_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...extraHeaders,
      },
      body: new URLSearchParams(data),
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.json() as Promise<Record<string, unknown>>
  } finally {
    clearTimeout(timer)
  }
}
