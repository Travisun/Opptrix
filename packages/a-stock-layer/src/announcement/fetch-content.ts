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
      // 腾讯公告列表 API 已随 scraping provider 下线；仅保留 URL 识别，正文需外链或 generic html/pdf。
      return null
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
