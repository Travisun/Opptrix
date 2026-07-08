import { fetchTencentNoticeList } from '../providers/tencent/api/proxy.js'
import { fetchSinaNoticeList } from '../providers/sinafinance/api/content.js'
import { compressPlainTextForAgent, isLowQualityExtractedText, truncatePlainTextForAgent } from './compress.js'
import {
  fetchHtmlAnnouncementContent,
  fetchPdfAnnouncementContent,
  fetchSinaBulletinContent,
  fetchSinaMemordDetailContent,
  toAnnouncementContent,
} from './fetchers.js'
import { resolveAnnouncementUrl } from './url-resolver.js'
import type { AnnouncementContent } from './types.js'

const DEFAULT_MAX_CHARS = 16_000

function finalize(
  url: string,
  source: string,
  raw: { title?: string; contentType: 'pdf' | 'html'; pdfUrl?: string; text: string },
  maxChars: number,
): AnnouncementContent | null {
  const compressed = compressPlainTextForAgent(raw.text)
  if (!compressed || compressed.length < 20 || isLowQualityExtractedText(compressed)) return null
  const { text, truncated, charCount } = truncatePlainTextForAgent(compressed, maxChars)
  return toAnnouncementContent(url, source, {
    title: raw.title,
    contentType: raw.contentType,
    pdfUrl: raw.pdfUrl,
    text,
    charCount,
    truncated,
  })
}

async function trySinaNoticeByTitle(code: string, title: string) {
  const data = await fetchSinaNoticeList({ code, pageSize: 30 })
  const rows = data.result?.data ?? []
  const normalized = title.replace(/\s+/g, '')
  const hit = rows.find(row => {
    const t = String(row.title ?? '').replace(/\s+/g, '')
    return t === normalized || t.includes(normalized) || normalized.includes(t)
  })
  if (!hit?.id) return null
  return fetchSinaMemordDetailContent(code, String(hit.id))
}

async function fetchTencentNoticeContent(
  code: string,
  noticeId: string,
  sourceUrl: string,
  maxChars: number,
): Promise<AnnouncementContent | null> {
  const list = await fetchTencentNoticeList({ code, page: 1, pageSize: 50 })
  const hit = list.data?.find(row => String(row.id) === noticeId)
  if (!hit) return null

  const external = String(hit.url ?? '').trim()
  if (external) {
    const nested = await fetchAnnouncementContentByUrl(external, { maxChars })
    if (nested) return nested
  }

  const sina = await trySinaNoticeByTitle(code, hit.title)
  if (sina?.text) {
    return finalize(sourceUrl, 'tencent_via_sina_memord', sina, maxChars)
  }

  return null
}

/**
 * 按公告 URL 提取正文（HTML 去标签或 PDF 文字），压缩后供 Agent 阅读。
 */
export async function fetchAnnouncementContentByUrl(
  inputUrl: string,
  opts?: { maxChars?: number },
): Promise<AnnouncementContent | null> {
  const plan = resolveAnnouncementUrl(inputUrl)
  if (!plan) return null
  const maxChars = Math.max(2000, Math.min(opts?.maxChars ?? DEFAULT_MAX_CHARS, 40_000))

  switch (plan.kind) {
    case 'sina_bulletin': {
      const raw = await fetchSinaBulletinContent(plan.code, plan.bulletinId)
      return finalize(plan.url, 'sina_bulletin', raw, maxChars)
    }
    case 'sina_memord': {
      const raw = await fetchSinaMemordDetailContent(plan.code, plan.noticeId)
      return finalize(plan.url, 'sina_memord', raw, maxChars)
    }
    case 'tencent_notice':
      return fetchTencentNoticeContent(plan.code, plan.noticeId, plan.url, maxChars)
    case 'pdf': {
      const raw = await fetchPdfAnnouncementContent(plan.pdfUrl)
      return finalize(plan.url, 'pdf', raw, maxChars)
    }
    case 'html': {
      const raw = await fetchHtmlAnnouncementContent(plan.pageUrl)
      return finalize(plan.url, 'generic_html', raw, maxChars)
    }
    default:
      return null
  }
}
