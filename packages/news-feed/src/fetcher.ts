export interface FetchFeedOptions {
  etag?: string
  lastModified?: string
  timeoutMs?: number
}

export interface FetchFeedResult {
  xml: string
  etag?: string
  lastModified?: string
  notModified: boolean
}

function resolveUserAgent(): string | undefined {
  const ua = process.env.OPPTRIX_HTTP_USER_AGENT?.trim()
  return ua || undefined
}

export async function fetchFeedXml(
  url: string,
  opts: FetchFeedOptions = {},
): Promise<FetchFeedResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000)
  const headers: Record<string, string> = {
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  }
  const userAgent = resolveUserAgent()
  if (userAgent) headers['User-Agent'] = userAgent
  if (opts.etag) headers['If-None-Match'] = opts.etag
  if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified

  try {
    const resp = await fetch(url, { headers, signal: controller.signal })
    if (resp.status === 304) {
      return { xml: '', notModified: true }
    }
    if (!resp.ok) {
      throw new Error(`拉取失败 HTTP ${resp.status}`)
    }
    const xml = await resp.text()
    if (!xml.trim()) throw new Error('订阅源返回空内容')
    return {
      xml,
      etag: resp.headers.get('etag') ?? undefined,
      lastModified: resp.headers.get('last-modified') ?? undefined,
      notModified: false,
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('拉取超时，请稍后重试')
    }
    throw e instanceof Error ? e : new Error(String(e))
  } finally {
    clearTimeout(timeout)
  }
}
