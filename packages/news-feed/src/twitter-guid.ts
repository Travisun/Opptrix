const TWITTER_STATUS_RE = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/(?:[^/]+\/)?status\/(\d+)/i

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** Extract numeric status id from Twitter / X permalink or guid. */
export function extractTwitterStatusId(value: string): string | null {
  const m = TWITTER_STATUS_RE.exec(value.trim())
  return m?.[1] ?? null
}

export function buildTwitterStatusDedupeKey(statusId: string): string {
  return `twitter:status:${statusId}`
}

/** Canonical per-subscription dedupe key; Twitter/X status ids are normalized. */
export function normalizeFeedItemDedupeKey(
  rawGuid: string,
  link: string,
  atomId?: string,
): string {
  for (const candidate of [rawGuid, atomId ?? '', link]) {
    const trimmed = candidate.trim()
    if (!trimmed) continue
    const statusId = extractTwitterStatusId(trimmed)
    if (statusId) return buildTwitterStatusDedupeKey(statusId)
  }
  return rawGuid.trim() || atomId?.trim() || link.trim()
}

/** Raw guid for persistence (feed guid, else atom id, else link). */
export function resolveFeedItemGuid(
  rawGuid: string,
  link: string,
  atomId?: string,
): string {
  return rawGuid.trim() || atomId?.trim() || link.trim()
}

export function isTwitterFeedItem(rawGuid: string, link: string, atomId?: string): boolean {
  return [rawGuid, link, atomId ?? ''].some(v => extractTwitterStatusId(v) !== null)
}

/** Title fallback for RSSHub Twitter items with empty or link-only titles. */
export function resolveTwitterFeedTitle(
  title: string,
  link: string,
  description?: string,
): string {
  const trimmedTitle = title.trim()
  const trimmedLink = link.trim()
  if (trimmedTitle && trimmedTitle !== trimmedLink) return trimmedTitle

  const text = description ? stripHtml(description) : ''
  if (text) {
    return text.length > 120 ? `${text.slice(0, 120)}…` : text
  }
  if (description) {
    if (/<video\b/i.test(description)) return '[视频]'
    if (/<img\b/i.test(description)) return '[图片]'
  }
  if (extractTwitterStatusId(trimmedLink) || extractTwitterStatusId(trimmedTitle)) {
    return '[推文]'
  }
  return trimmedTitle || trimmedLink || '无标题'
}
