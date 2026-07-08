import { fetchSinaBulletinDetailContent } from '../providers/sinafinance/api/bulletins.js'
import {
  fetchSinaAllBulletinListHtml,
  parseSinaAllBulletinListFromHtml,
} from '../providers/sinafinance/api/bulletins.js'
import { fetchSinaNoticeList } from '../providers/sinafinance/api/content.js'
import { buildSinaCorpReferer } from '../providers/sinafinance/api/types.js'
import { extractPdfPlainText } from '../providers/sinafinance/api/pdf-text.js'
import { fetchAnnouncementBinary, fetchAnnouncementText } from './http-fetch.js'
import { extractMainHtmlText, extractPdfUrlsFromHtml, extractTitleFromHtml } from './html-extract.js'
import type { AnnouncementContent } from './types.js'

const ATTACHMENT_ONLY = /^公告内容详见附件$/i

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length > 4 && buf.subarray(0, 4).toString() === '%PDF'
}

function normalizeNoticeTitle(title: string): string {
  return title
    .replace(/^[^：:]+[:：]\s*/, '')
    .replace(/\s+/g, '')
    .replace(/：/g, ':')
    .toLowerCase()
}
async function resolveSinaMemordViaBulletin(code: string, noticeId: string) {
  const notices = await fetchSinaNoticeList({ code, pageSize: 50 })
  const hit = notices.result?.data?.find(row => String(row.id) === String(noticeId).replace(/\D/g, ''))
  if (!hit?.title) return null
  const target = normalizeNoticeTitle(hit.title)

  for (let page = 1; page <= 4; page += 1) {
    const html = await fetchSinaAllBulletinListHtml(code, page)
    const parsed = parseSinaAllBulletinListFromHtml(html, page)
    const bulletin = parsed.items.find(item => {
      const t = normalizeNoticeTitle(item.title)
      return t === target || t.includes(target) || target.includes(t)
    })
    if (bulletin?.id) {
      return fetchSinaBulletinDetailContent(code, bulletin.id)
    }
    if (!parsed.hasNext) break
  }
  return null
}

export async function fetchSinaMemordDetailContent(
  code: string,
  noticeId: string,
): Promise<{
  title?: string
  contentType: 'pdf' | 'html'
  pdfUrl?: string
  text: string
  link: string
}> {
  const bid = String(noticeId ?? '').replace(/\D/g, '')
  const link =
    `https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllMemordDetail.php?stockid=${encodeURIComponent(code)}&id=${encodeURIComponent(bid)}`
  const html = await fetchAnnouncementText(link, {
    referer: buildSinaCorpReferer(code),
    encoding: 'gbk',
  })
  const title = extractTitleFromHtml(html)
  const pdfUrls = extractPdfUrlsFromHtml(html)

  if (pdfUrls.length) {
    const pdfUrl = pdfUrls[0]!
    try {
      const pdfBuf = await fetchAnnouncementBinary(pdfUrl, { referer: buildSinaCorpReferer(code) })
      if (isPdfBuffer(pdfBuf)) {
        const pdfText = await extractPdfPlainText(pdfBuf)
        if (pdfText.length > 20) {
          return { title, contentType: 'pdf', pdfUrl, text: pdfText, link }
        }
      }
    } catch {
      // fall through
    }
  }

  const bulletin = await resolveSinaMemordViaBulletin(code, noticeId)
  if (bulletin?.text && bulletin.text.length > 20) {
    return { ...bulletin, link }
  }

  const htmlText = extractMainHtmlText(html)
  const text = htmlText && !ATTACHMENT_ONLY.test(htmlText) ? htmlText : htmlText ?? ''
  return {
    title,
    contentType: 'html',
    pdfUrl: pdfUrls[0],
    text,
    link,
  }
}

export async function fetchSinaBulletinContent(code: string, bulletinId: string) {
  return fetchSinaBulletinDetailContent(code, bulletinId)
}

export async function fetchPdfAnnouncementContent(pdfUrl: string, referer?: string) {
  const pdfBuf = await fetchAnnouncementBinary(pdfUrl, { referer })
  if (!isPdfBuffer(pdfBuf)) {
    throw new Error('响应不是 PDF 文件')
  }
  const text = await extractPdfPlainText(pdfBuf)
  return { contentType: 'pdf' as const, pdfUrl, text }
}

export async function fetchHtmlAnnouncementContent(pageUrl: string) {
  const lower = pageUrl.toLowerCase()
  const encoding = lower.includes('sina.com.cn') ? 'gbk' as const : 'utf-8' as const
  const referer = lower.includes('cninfo.com.cn') ? 'https://www.cninfo.com.cn/' : undefined
  const html = await fetchAnnouncementText(pageUrl, { referer, encoding })
  const title = extractTitleFromHtml(html)
  const pdfUrls = extractPdfUrlsFromHtml(html)

  if (pdfUrls.length) {
    try {
      const pdfBuf = await fetchAnnouncementBinary(pdfUrls[0]!, { referer })
      if (isPdfBuffer(pdfBuf)) {
        const pdf = await fetchPdfAnnouncementContent(pdfUrls[0]!, referer)
        if (pdf.text.length > 20) {
          return { title, contentType: 'pdf' as const, pdfUrl: pdfUrls[0], text: pdf.text }
        }
      }
    } catch {
      // fall through
    }
  }

  const text = extractMainHtmlText(html) ?? ''
  return { title, contentType: 'html' as const, pdfUrl: pdfUrls[0], text }
}

export function toAnnouncementContent(
  url: string,
  source: string,
  payload: {
    title?: string
    contentType: 'pdf' | 'html'
    pdfUrl?: string
    text: string
    charCount: number
    truncated: boolean
  },
): AnnouncementContent {
  return {
    url,
    title: payload.title,
    contentType: payload.contentType,
    pdfUrl: payload.pdfUrl,
    text: payload.text,
    charCount: payload.charCount,
    truncated: payload.truncated,
    source,
  }
}
