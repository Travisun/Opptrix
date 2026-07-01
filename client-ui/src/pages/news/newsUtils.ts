import type { FeedArticle, FeedSubscription } from '../../types/schemas'
import type { SessionArticleContextRef } from '../../types/chat'
import { openExternalUrl } from '../../platform/openUrl'
import { previewSelectionText } from '../../utils/formatContextRefPreview'

const TWITTER_VIDEO_SRC_RE = /^https:\/\/video\.twimg\.com\//i

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** 剥离危险标签，用于 RSS HTML 正文展示 */
export function sanitizeFeedHtml(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')

  // 避免 RSS 内联宽高撑破阅读区（逐项剥离）
  const dimRe = /(<(?:img|video|source)\b[^>]*?)\s(?:width|height)\s*=\s*("[^"]*"|'[^']*'|\S+)/gi
  for (let i = 0; i < 8; i += 1) {
    const next = out.replace(dimRe, '$1')
    if (next === out) break
    out = next
  }

  // 确保 video 标签完整（Twitter 视频在阅读区点击跳转浏览器）
  out = out.replace(/<video\b([^>]*?)(\s*\/?)>/gi, (_full, attrs: string, end: string) => {
    let next = attrs
    if (!/\bcontrols\b/i.test(next)) next += ' controls'
    if (!/\bplaysinline\b/i.test(next)) next += ' playsinline'
    if (!/\bpreload\b/i.test(next)) next += ' preload="metadata"'
    return `<video${next}${end}>`
  })

  return out
}

function setupExternalTwitterVideo(video: HTMLVideoElement, src: string) {
  video.controls = false
  video.removeAttribute('controls')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.referrerPolicy = 'no-referrer'

  const parent = video.parentNode
  if (!parent || video.closest('.opptrix-news-video-external')) return

  const wrap = document.createElement('button')
  wrap.type = 'button'
  wrap.className = 'opptrix-news-video-external'
  wrap.setAttribute('aria-label', '在浏览器中播放视频')
  parent.insertBefore(wrap, video)
  wrap.appendChild(video)

  const open = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    openExternalUrl(src)
  }
  wrap.addEventListener('click', open)
}

function bindMediaInteractionStop(el: HTMLMediaElement) {
  const stop = (e: Event) => e.stopPropagation()
  el.addEventListener('click', stop)
  el.addEventListener('pointerdown', stop)
}

/** 阅读区注入后增强 video/audio */
export function enhanceFeedMedia(root: HTMLElement): void {
  root.querySelectorAll('video').forEach(el => {
    const rawSrc = el.getAttribute('src')?.trim()
    if (rawSrc && TWITTER_VIDEO_SRC_RE.test(rawSrc)) {
      setupExternalTwitterVideo(el, rawSrc)
      return
    }

    el.controls = true
    el.playsInline = true
    el.referrerPolicy = 'no-referrer'
    if (!el.preload) el.preload = 'metadata'
    bindMediaInteractionStop(el)
  })

  root.querySelectorAll('audio').forEach(el => {
    el.controls = true
    bindMediaInteractionStop(el)
  })
}

/** Normalize titles for cross-source duplicate detection on the timeline. */
export function normalizeArticleTitle(title: string): string {
  let t = stripHtml(title)
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
  t = t.replace(/^(\s*【[^】]{1,16}】\s*)+/, '')
  return t.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')
}

export function articleTitleDedupeKey(article: Pick<FeedArticle, 'id' | 'title'>): string {
  const normalized = normalizeArticleTitle(article.title)
  return normalized || `__id:${article.id}`
}

/** Keep first occurrence per title (array should be pub_date desc). */
export function dedupeArticlesByTitle<T extends Pick<FeedArticle, 'id' | 'title'>>(
  articles: T[],
): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const article of articles) {
    const key = articleTitleDedupeKey(article)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(article)
  }
  return result
}

export function subscriptionUrlKey(raw: string): string {
  const parsed = new URL(raw.trim())
  parsed.hostname = parsed.hostname.toLowerCase()
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1)
  }
  return parsed.toString()
}

export function isSameSubscriptionUrl(a: string, b: string): boolean {
  try {
    return subscriptionUrlKey(a) === subscriptionUrlKey(b)
  } catch {
    return a.trim() === b.trim()
  }
}

export function findDuplicateSubscription(
  subs: FeedSubscription[],
  url: string,
): FeedSubscription | undefined {
  let key: string
  try {
    key = subscriptionUrlKey(url)
  } catch {
    key = url.trim()
  }
  return subs.find(s => {
    const resolved = s.resolved_url
    if (resolved) {
      try {
        if (subscriptionUrlKey(resolved) === key) return true
      } catch {
        if (resolved === key) return true
      }
    }
    try {
      return subscriptionUrlKey(s.url) === key
    } catch {
      return s.url.trim() === key
    }
  })
}

export function formatSubscriptionUrlShort(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname + u.search
    const host = u.hostname
    if (!path || path === '/') return host
    const maxPath = 28
    const shortPath = path.length > maxPath ? `${path.slice(0, maxPath)}…` : path
    return `${host}${shortPath}`
  } catch {
    return url.length > 36 ? `${url.slice(0, 36)}…` : url
  }
}

export function buildFeedArticleBodyText(article: FeedArticle): string {
  return stripHtml(article.content_html || article.summary || '') || article.title
}

export function feedArticleToContextRef(article: FeedArticle): SessionArticleContextRef {
  const anchorAt = article.pub_date || new Date().toISOString()
  const bodyText = buildFeedArticleBodyText(article)
  return {
    kind: 'article',
    articleId: article.id,
    title: article.title,
    sourceTitle: article.source_title,
    link: article.link,
    pubDate: anchorAt,
    bodyText,
    anchorAt,
    preview: previewSelectionText(article.title),
  }
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
