import { stripHtmlTags } from '../providers/sinafinance/api/html.js'

const PDF_HREF_RE = /href=['"](https?:\/\/[^'"]+\.pdf[^'"]*)['"]/gi

export function extractPdfUrlsFromHtml(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(PDF_HREF_RE)) {
    out.add(m[1]!.replace(/&amp;/g, '&'))
  }
  return [...out]
}

export function extractMainHtmlText(html: string): string | undefined {
  const candidates = [
    html.match(/id=["']content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/class=["'][^"']*article[^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1],
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1],
    html.match(/class=["'][^"']*detail[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1],
  ]
  for (const block of candidates) {
    if (!block) continue
    const text = stripHtmlTags(block).replace(/\s+/g, ' ').trim()
    if (text.length > 40) return text
  }
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]
  const body = stripHtmlTags(html.replace(/<head[\s\S]*?<\/head>/gi, ' ')).replace(/\s+/g, ' ').trim()
  if (body.length > 80) return body
  return title ? stripHtmlTags(title) : undefined
}

export function extractTitleFromHtml(html: string): string | undefined {
  const titleRaw = html.match(/<title>([^<]+)<\/title>/i)?.[1]
  if (!titleRaw) return undefined
  return stripHtmlTags(titleRaw)
    .replace(/_.*新浪网.*$/i, '')
    .replace(/_.*新浪财经.*$/i, '')
    .replace(/_公司公告_.*$/i, '')
    .trim()
}
