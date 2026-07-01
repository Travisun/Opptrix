export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** 剥离危险标签，用于 RSS HTML 正文展示 */
export function sanitizeFeedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

import type { FeedSubscription } from '../../types/schemas'

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
