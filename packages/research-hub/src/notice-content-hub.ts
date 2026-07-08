import { fetchAnnouncementContentByUrl } from '@opptrix/a-stock-layer'
import { ok, fail, type ResearchResult } from '@opptrix/shared'

export async function noticeContent(
  params: Record<string, unknown>,
  t0: number,
): Promise<ResearchResult> {
  const url = typeof params.url === 'string' ? params.url.trim() : ''
  if (!url) return fail('url 必填（公告详情页或 PDF 链接）', t0)

  const maxRaw = Number(params.max_chars ?? params.maxChars ?? 16_000)
  const maxChars = Number.isFinite(maxRaw)
    ? Math.max(2000, Math.min(maxRaw, 40_000))
    : 16_000

  try {
    const content = await fetchAnnouncementContentByUrl(url, { maxChars })
    if (!content?.text) {
      return fail('未能从该链接提取公告正文，请确认 URL 可访问或换用公告列表中的链接', t0)
    }
    return ok({
      url: content.url,
      title: content.title,
      content_type: content.contentType,
      pdf_url: content.pdfUrl,
      text: content.text,
      char_count: content.charCount,
      truncated: content.truncated,
      source: content.source,
      hint: '正文已去 HTML / 提取 PDF 文字并压缩空白；truncated=true 表示已截断，可增大 max_chars 重试',
    }, content.title ? `公告：${content.title}` : '公告正文', t0)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), t0)
  }
}
