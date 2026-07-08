import { ProviderHttpClient } from '../providers/common/http-client.js'
import { HTTP_DEFAULT_HEADERS } from '../utils/http-shared.js'

const announcementHttp = new ProviderHttpClient({
  providerId: 'announcement',
  timeoutMs: 25000,
  maxRetries: 2,
  bypassRateLimit: true,
  defaultHeaders: HTTP_DEFAULT_HEADERS,
})

export async function fetchAnnouncementText(
  url: string,
  opts?: { referer?: string; encoding?: 'utf-8' | 'gbk'; timeoutMs?: number },
): Promise<string> {
  const headers: Record<string, string> = {}
  if (opts?.referer) headers.Referer = opts.referer
  const resp = await announcementHttp.fetch(url, {
    headers,
    timeoutMs: opts?.timeoutMs ?? 25000,
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const buf = await resp.arrayBuffer()
  const encoding = opts?.encoding ?? (url.includes('sina.com.cn') ? 'gbk' : 'utf-8')
  return new TextDecoder(encoding).decode(buf)
}

export async function fetchAnnouncementBinary(
  url: string,
  opts?: { referer?: string; timeoutMs?: number },
): Promise<Buffer> {
  const headers: Record<string, string> = {}
  if (opts?.referer) headers.Referer = opts.referer
  const resp = await announcementHttp.fetch(url, {
    headers,
    timeoutMs: opts?.timeoutMs ?? 30000,
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}
