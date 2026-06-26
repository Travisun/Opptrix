const HEADERS = {
  'User-Agent': (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ),
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://quote.eastmoney.com/',
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const headers = { ...HEADERS, ...extraHeaders }

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
      headers: { ...HEADERS, ...extraHeaders },
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.text()
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
        ...HEADERS,
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
