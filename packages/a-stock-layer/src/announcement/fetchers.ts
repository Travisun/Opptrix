import { extractPdfPlainText } from './pdf-text.js'
import { fetchAnnouncementBinary, fetchAnnouncementText } from './http-fetch.js'
import { extractMainHtmlText, extractPdfUrlsFromHtml, extractTitleFromHtml } from './html-extract.js'
import type { AnnouncementContent } from './types.js'

const ATTACHMENT_ONLY = /^公告内容详见附件$/i
const SINA_CORP_VIEW_BASE = 'https://vip.stock.finance.sina.com.cn/corp/view'

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length > 4 && buf.subarray(0, 4).toString() === '%PDF'
}

function buildSinaCorpReferer(code: string): string {
  return `https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/${encodeURIComponent(code)}.phtml`
}

async function fetchSinaPageText(code: string, pagePath: string): Promise<string> {
  return fetchAnnouncementText(pagePath, {
    referer: buildSinaCorpReferer(code),
    encoding: 'gbk',
  })
}

async function tryPdfTextFromHtml(
  html: string,
  code: string,
): Promise<{ pdfUrl: string; text: string } | null> {
  const pdfUrls = extractPdfUrlsFromHtml(html)
  if (!pdfUrls.length) return null
  const pdfUrl = pdfUrls[0]!
  try {
    const pdfBuf = await fetchAnnouncementBinary(pdfUrl, { referer: buildSinaCorpReferer(code) })
    if (!isPdfBuffer(pdfBuf)) return null
    const pdfText = await extractPdfPlainText(pdfBuf)
    if (pdfText.length > 20) return { pdfUrl, text: pdfText }
  } catch {
    // fall through
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
  const html = await fetchSinaPageText(code, link)
  const title = extractTitleFromHtml(html)
  const pdfHit = await tryPdfTextFromHtml(html, code)
  if (pdfHit) {
    return { title, contentType: 'pdf', pdfUrl: pdfHit.pdfUrl, text: pdfHit.text, link }
  }

  const htmlText = extractMainHtmlText(html)
  const text = htmlText && !ATTACHMENT_ONLY.test(htmlText) ? htmlText : htmlText ?? ''
  return {
    title,
    contentType: 'html',
    pdfUrl: extractPdfUrlsFromHtml(html)[0],
    text,
    link,
  }
}

export async function fetchSinaBulletinContent(code: string, bulletinId: string) {
  const bid = String(bulletinId ?? '').replace(/\D/g, '')
  const link =
    `${SINA_CORP_VIEW_BASE}/vCB_AllBulletinDetail.php?stockid=${encodeURIComponent(code)}&id=${encodeURIComponent(bid)}`
  const html = await fetchSinaPageText(code, link)
  const title = extractTitleFromHtml(html)
  const pdfHit = await tryPdfTextFromHtml(html, code)
  if (pdfHit) {
    return { title, contentType: 'pdf' as const, pdfUrl: pdfHit.pdfUrl, text: pdfHit.text, link }
  }

  const htmlText = extractMainHtmlText(html)
  const text = htmlText && !ATTACHMENT_ONLY.test(htmlText) ? htmlText : htmlText ?? ''
  return {
    title,
    contentType: 'html' as const,
    pdfUrl: extractPdfUrlsFromHtml(html)[0],
    text,
    link,
  }
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
