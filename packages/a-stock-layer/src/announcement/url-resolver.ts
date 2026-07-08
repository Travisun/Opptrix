import type { AnnouncementFetchPlan } from './types.js'

function absUrl(base: string, href: string): string {
  const trimmed = href.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  try {
    return new URL(trimmed, base).href
  } catch {
    return trimmed
  }
}

export function resolveAnnouncementUrl(input: string): AnnouncementFetchPlan | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  let url = raw
  try {
    url = new URL(raw).href
  } catch {
    return null
  }

  const lower = url.toLowerCase()

  const sinaBulletin = url.match(
    /vip\.stock\.finance\.sina\.com\.cn\/corp\/(?:view\/)?vCB_AllBulletinDetail\.php\?[^#]*stockid=(\d{6})[^#&]*(?:&|&)id=(\d+)/i,
  ) ?? url.match(
    /vip\.stock\.finance\.sina\.com\.cn\/corp\/(?:view\/)?vCB_AllBulletinDetail\.php\?[^#]*id=(\d+)[^#&]*(?:&|&)stockid=(\d{6})/i,
  )
  if (sinaBulletin) {
    const code = sinaBulletin[1]!.length === 6 ? sinaBulletin[1]! : sinaBulletin[2]!
    const bulletinId = sinaBulletin[1]!.length === 6 ? sinaBulletin[2]! : sinaBulletin[1]!
    return { kind: 'sina_bulletin', code, bulletinId, url }
  }

  const sinaMemordQuery = url.match(
    /vip\.stock\.finance\.sina\.com\.cn\/corp\/(?:view\/)?vCB_AllMemordDetail\.php\?[^#]*stockid=(\d{6})/i,
  )
  if (sinaMemordQuery) {
    const code = sinaMemordQuery[1]!
    const hashId = url.match(/#_(\d+)/)?.[1]
    const queryId = url.match(/[?&]id=(\d+)/i)?.[1]
    const noticeId = queryId ?? hashId
    if (noticeId) return { kind: 'sina_memord', code, noticeId, url }
  }

  const tencentNotice = url.match(/gu\.qq\.com\/(?:s[hz]|bj)?(\d{6})\/gp\/notice\/([^/?#]+)/i)
  if (tencentNotice) {
    return {
      kind: 'tencent_notice',
      code: tencentNotice[1]!,
      noticeId: decodeURIComponent(tencentNotice[2]!),
      url,
    }
  }

  if (/\.pdf(?:\?|#|$)/i.test(lower)) {
    return { kind: 'pdf', pdfUrl: url, url }
  }

  return { kind: 'html', pageUrl: url, url }
}

export function normalizeAnnouncementUrl(input: string, base?: string): string | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (base) return absUrl(base, raw)
  return null
}
