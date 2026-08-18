/**
 * 各引擎 HTML → 结构化 hits（无 cheerio，正则/字符串解析）。
 */

import type { EngineId } from './engines.js'

export interface SearchHit {
  title: string
  url: string
  snippet: string
  engine: EngineId
}

const VERIFY_RE =
  /captcha|unusual traffic|verify you are|访问验证|安全验证|请输入验证码|robot check|cf-challenge/i

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function looksLikeVerifyPage(html: string): boolean {
  if (!html || html.length < 80) return true
  return VERIFY_RE.test(html.slice(0, 8000))
}

function pushHit(
  out: SearchHit[],
  engine: EngineId,
  title: string,
  url: string,
  snippet: string,
): void {
  const t = stripTags(title)
  const u = decodeHtmlEntities(url).trim()
  const sn = stripTags(snippet).slice(0, 400)
  if (!t || !u) return
  if (!/^https?:\/\//i.test(u)) return
  if (/javascript:/i.test(u)) return
  out.push({ title: t.slice(0, 200), url: u, snippet: sn, engine })
}

/** DuckDuckGo HTML 版 */
function parseDuckDuckGo(html: string, engine: EngineId): SearchHit[] {
  const out: SearchHit[] = []
  // result__a + 邻近 snippet
  const re =
    /class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,800}?class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && out.length < 20) {
    pushHit(out, engine, m[2] ?? '', m[1] ?? '', m[3] ?? '')
  }
  if (out.length) return out
  // 宽松：仅 result__a
  const re2 = /class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  while ((m = re2.exec(html)) !== null && out.length < 20) {
    pushHit(out, engine, m[2] ?? '', m[1] ?? '', '')
  }
  return out
}

/** Bing（cn.bing.com） */
function parseBing(html: string, engine: EngineId): SearchHit[] {
  const out: SearchHit[] = []
  const blocks = html.split(/class="b_algo"/i).slice(1)
  for (const block of blocks) {
    if (out.length >= 20) break
    const a = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!a) continue
    const sn =
      block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      ?? block.match(/class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)
    pushHit(out, engine, a[2] ?? '', a[1] ?? '', sn?.[1] ?? '')
  }
  return out
}

/** 百度（尽力；常反爬） */
function parseBaidu(html: string, engine: EngineId): SearchHit[] {
  const out: SearchHit[] = []
  const re =
    /<h3[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && out.length < 20) {
    const after = html.slice(m.index, m.index + 1200)
    const sn = after.match(/class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\//i)
    pushHit(out, engine, m[2] ?? '', m[1] ?? '', sn?.[1] ?? '')
  }
  return out
}

/** 通用：h2/h3 > a[href=http] */
function parseGeneric(html: string, engine: EngineId): SearchHit[] {
  const out: SearchHit[] = []
  const re =
    /<(?:h2|h3)[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && out.length < 20) {
    const href = m[1] ?? ''
    // 跳过引擎自身导航
    if (/bing\.com\/search|google\.com\/search|baidu\.com\/s\?/i.test(href)) continue
    pushHit(out, engine, m[2] ?? '', href, '')
  }
  return out
}

export function parseEngineHtml(engineId: EngineId, html: string): SearchHit[] {
  if (looksLikeVerifyPage(html)) return []
  try {
    switch (engineId) {
      case 'duckduckgo':
        return parseDuckDuckGo(html, engineId)
      case 'bing_cn':
      case 'bing_int':
        return parseBing(html, engineId)
      case 'baidu':
        return parseBaidu(html, engineId)
      default: {
        const generic = parseGeneric(html, engineId)
        if (generic.length) return generic
        // 部分引擎版式接近 Bing
        return parseBing(html, engineId)
      }
    }
  } catch {
    return []
  }
}
