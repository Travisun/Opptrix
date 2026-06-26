import { marked } from 'marked'
import { inlineStyles, loadTheme } from './theme.js'

export interface ConvertResult {
  html: string
  title: string
  digest: string
  images: string[]
  wordCount: number
}

function extractTitle(text: string) {
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (s.startsWith('# ') && !s.startsWith('## ')) return s.slice(2).trim()
  }
  return ''
}

function stripH1(text: string) {
  return text.split('\n').filter(line => {
    const s = line.trim()
    return !(s.startsWith('# ') && !s.startsWith('## '))
  }).join('\n')
}

function fixCjkSpacing(text: string) {
  return text
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
}

function findImages(text: string) {
  const images: string[] = []
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) images.push(m[1])
  for (const m of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) images.push(m[1])
  return [...new Set(images)]
}

function plainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function generateDigest(html: string, maxChars = 54) {
  const text = plainText(html)
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '…'
}

function applyTagStyles(html: string, styles: ReturnType<typeof inlineStyles>) {
  const tags = ['h2', 'h3', 'h4', 'p', 'strong', 'em', 'blockquote', 'code', 'pre', 'img', 'table', 'th', 'td', 'a', 'hr', 'li'] as const
  let out = html
  for (const tag of tags) {
    const style = styles[tag]
    out = out.replace(new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi'), (match, attrs = '') => {
      if (/style=/i.test(attrs)) return match
      return `<${tag}${attrs} style="${style}">`
    })
  }
  return out
}

function convertLists(html: string, styles: ReturnType<typeof inlineStyles>) {
  return html.replace(/<ul>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    return items.map(m =>
      `<section style="${styles.p}"><span style="${styles.strong}">• </span>${m[1]}</section>`,
    ).join('')
  }).replace(/<ol>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    return items.map((m, i) =>
      `<section style="${styles.p}"><span style="${styles.strong}">${i + 1}. </span>${m[1]}</section>`,
    ).join('')
  })
}

function convertLinksToFootnotes(html: string, styles: ReturnType<typeof inlineStyles>) {
  const links: string[] = []
  let idx = 0
  const body = html.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    idx += 1
    links.push(`[${idx}] ${plainText(text)}: ${href}`)
    return `<span style="${styles.strong}">[${idx}]</span>`
  })
  if (!links.length) return body
  const footnotes = links.map(l => `<p style="${styles.p};font-size:14px;color:#666;">${l}</p>`).join('')
  return body + `<section style="margin-top:24px;border-top:1px solid #e0e0e0;padding-top:12px;">${footnotes}</section>`
}

export function formatMarkdownToWechat(markdown: string, themeName = 'minimal-clean'): ConvertResult {
  const title = extractTitle(markdown)
  let body = stripH1(fixCjkSpacing(markdown))
  body = body.replace(/^---+\s*$/gm, '')
  const images = findImages(markdown)

  marked.setOptions({ gfm: true, breaks: true })
  let html = marked.parse(body) as string

  const theme = loadTheme(themeName)
  const styles = inlineStyles(theme.colors)
  html = convertLists(html, styles)
  html = convertLinksToFootnotes(html, styles)
  html = applyTagStyles(html, styles)

  const digest = generateDigest(html)
  const wordCount = plainText(html).replace(/\s/g, '').length

  return { html, title, digest, images, wordCount }
}

export function wrapPreviewHtml(bodyHtml: string, themeName = 'minimal-clean') {
  const theme = loadTheme(themeName)
  const bg = theme.colors.background ?? '#ffffff'
  const text = theme.colors.text ?? '#333333'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title></head>`
    + `<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:${bg};color:${text};max-width:720px;margin:0 auto;padding:20px;">`
    + bodyHtml + '</body></html>'
}
