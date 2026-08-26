/** 新加入关注后：此宽限期内优先展示加载态，不展示失败文案 */
export const WATCHLIST_NEW_ITEM_QUOTE_GRACE_MS = 15_000

export function watchlistItemAddedAtMs(item: { addedAt?: string | null }): number | null {
  const raw = item.addedAt
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : null
}

export function isWatchlistItemWithinQuoteGrace(
  item: { addedAt?: string | null },
  nowMs = Date.now(),
): boolean {
  const addedAt = watchlistItemAddedAtMs(item)
  if (addedAt == null) return false
  return nowMs - addedAt < WATCHLIST_NEW_ITEM_QUOTE_GRACE_MS
}

/** 宽限期或整表刷新中：不将行态判为失败 */
export function shouldSuppressWatchlistQuoteFailure(
  item: { addedAt?: string | null },
  opts: { loadingQuotes?: boolean; hasPrice?: boolean },
): boolean {
  if (opts.hasPrice) return false
  if (opts.loadingQuotes) return true
  return isWatchlistItemWithinQuoteGrace(item)
}
