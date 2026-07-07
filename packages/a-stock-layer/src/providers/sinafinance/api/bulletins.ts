import { normalizeCode } from '../../../utils/helpers.js'
import { stripHtmlTags } from './html.js'
import { extractPdfPlainText } from './pdf-text.js'
import { fetchBinary, fetchText } from './http.js'
import { buildSinaCorpReferer } from './types.js'

export const SINA_BULLETIN_VIEW_BASE =
  'https://vip.stock.finance.sina.com.cn/corp/view'

export interface SinaAllBulletinItemRaw {
  date: string
  title: string
  link: string
  id: string
}

export interface SinaAllBulletinListParsed {
  items: SinaAllBulletinItemRaw[]
  page: number
  hasNext: boolean
}

export interface SinaBulletinDetailParsed {
  title?: string
  pdfUrls: string[]
  htmlText?: string
}

function stockId(code: string): string {
  return normalizeCode(code)
}

function absBulletinUrl(href: string): string {
  const trimmed = href.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('/')) return `https://vip.stock.finance.sina.com.cn${trimmed}`
  return `${SINA_BULLETIN_VIEW_BASE}/${trimmed.replace(/^\.\//, '')}`
}

function extractBulletinId(link: string): string {
  const m = link.match(/[?&]id=(\d+)/i)
  return m?.[1] ?? ''
}

/** 公司公告全量列表 — `vCB_AllBulletin.php`（支持翻页） */
export async function fetchSinaAllBulletinListHtml(code: string, page = 1): Promise<string> {
  const id = stockId(code)
  const pageNo = Math.max(1, Math.floor(page))
  const url = `${SINA_BULLETIN_VIEW_BASE}/vCB_AllBulletin.php?stockid=${encodeURIComponent(id)}&Page=${pageNo}`
  return fetchText(url, 'gbk', buildSinaCorpReferer(id))
}

export function parseSinaAllBulletinListFromHtml(
  html: string,
  page = 1,
): SinaAllBulletinListParsed {
  const block = html.match(/class="datelist"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? ''
  const items: SinaAllBulletinItemRaw[] = []
  const re =
    /(\d{4}-\d{2}-\d{2})(?:\s|&nbsp;)*<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const link = absBulletinUrl(m[2]!)
    const title = stripHtmlTags(m[3]!).trim()
    if (!title) continue
    items.push({
      date: m[1]!,
      title,
      link,
      id: extractBulletinId(link),
    })
  }

  const hasNext = items.length > 0 && /下一页/i.test(html)
  return { items, page: Math.max(1, page), hasNext }
}

/** 公告详情 — `vCB_AllBulletinDetail.php` */
export async function fetchSinaBulletinDetailHtml(code: string, bulletinId: string): Promise<string> {
  const id = stockId(code)
  const bid = String(bulletinId ?? '').replace(/\D/g, '')
  const url =
    `${SINA_BULLETIN_VIEW_BASE}/vCB_AllBulletinDetail.php?stockid=${encodeURIComponent(id)}&id=${encodeURIComponent(bid)}`
  return fetchText(url, 'gbk', buildSinaCorpReferer(id))
}

export function parseSinaBulletinDetailFromHtml(html: string): SinaBulletinDetailParsed {
  const titleRaw = html.match(/<title>([^<]+)<\/title>/i)?.[1]
  const title = titleRaw
    ? stripHtmlTags(titleRaw).replace(/_公司公告_.*$/, '').trim()
    : undefined

  const pdfSet = new Set<string>()
  for (const m of html.matchAll(
    /href=['"](https?:\/\/file\.finance\.sina\.com\.cn[^'"]+\.pdf[^'"]*)['"]/gi,
  )) {
    pdfSet.add(m[1]!)
  }

  const contentMatch = html.match(/id="content"[^>]*>([\s\S]*?)<\/div>/i)
  const htmlText = contentMatch?.[1]
    ? stripHtmlTags(contentMatch[1]).replace(/\s+/g, ' ').trim()
    : undefined

  return {
    title,
    pdfUrls: [...pdfSet],
    htmlText: htmlText || undefined,
  }
}

const ATTACHMENT_ONLY = /^公告内容详见附件$/i

/** 拉取公告正文：优先 PDF 附件文本，否则返回 HTML 正文 */
export async function fetchSinaBulletinDetailContent(
  code: string,
  bulletinId: string,
): Promise<{
  title?: string
  contentType: 'pdf' | 'html'
  pdfUrl?: string
  text: string
  link: string
}> {
  const id = stockId(code)
  const bid = String(bulletinId ?? '').replace(/\D/g, '')
  const link =
    `${SINA_BULLETIN_VIEW_BASE}/vCB_AllBulletinDetail.php?stockid=${encodeURIComponent(id)}&id=${encodeURIComponent(bid)}`
  const html = await fetchSinaBulletinDetailHtml(code, bid)
  const parsed = parseSinaBulletinDetailFromHtml(html)

  if (parsed.pdfUrls.length) {
    const pdfUrl = parsed.pdfUrls[0]!
    try {
      const pdfBuf = await fetchBinary(pdfUrl, buildSinaCorpReferer(id))
      const pdfText = await extractPdfPlainText(pdfBuf)
      if (pdfText.length > 20) {
        return {
          title: parsed.title,
          contentType: 'pdf',
          pdfUrl,
          text: pdfText,
          link,
        }
      }
    } catch {
      // PDF 下载/解析失败时回退 HTML
    }
  }

  const htmlText = parsed.htmlText && !ATTACHMENT_ONLY.test(parsed.htmlText)
    ? parsed.htmlText
    : parsed.htmlText ?? ''

  return {
    title: parsed.title,
    contentType: 'html',
    pdfUrl: parsed.pdfUrls[0],
    text: htmlText,
    link,
  }
}
