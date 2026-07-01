import type { FeedArticle, FeedSubscription } from './types.js'
import { MAX_ARTICLES_PER_FETCH } from './retention.js'
import { fetchAndParseFeed } from './parser.js'
import { getNewsFeedStore } from './store.js'

export async function refreshSubscription(sub: FeedSubscription): Promise<{
  items: FeedArticle[]
  error?: string
}> {
  const store = getNewsFeedStore()
  const meta = store.getSubscriptionMeta(sub.id)
  try {
    const result = await fetchAndParseFeed(sub, {
      etag: meta.etag,
      lastModified: meta.last_modified,
    })
    const now = new Date().toISOString()
    if (result.notModified) {
      store.updateSubscriptionMeta(sub.id, { last_fetched_at: now, last_error: undefined })
      return { items: store.listArticlesBySubscription(sub.id) }
    }
    const items = result.items.slice(0, MAX_ARTICLES_PER_FETCH)
    store.upsertArticlesForSubscription(sub.id, items)
    store.updateSubscriptionMeta(sub.id, {
      etag: result.etag,
      last_modified: result.lastModified,
      last_fetched_at: now,
      last_error: undefined,
    })
    const list = store.listSubscriptions().map(s =>
      s.id === sub.id
        ? { ...s, title: result.title || s.title, kind: result.kind, last_fetched_at: now, last_error: undefined }
        : s,
    )
    store.saveSubscriptions(list)
    return { items }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    store.updateSubscriptionMeta(sub.id, { last_error: msg, last_fetched_at: new Date().toISOString() })
    const list = store.listSubscriptions().map(s =>
      s.id === sub.id ? { ...s, last_error: msg } : s,
    )
    store.saveSubscriptions(list)
    return { items: [], error: msg }
  }
}

export async function refreshAllSubscriptions(): Promise<{
  refreshed: number
  errors: Array<{ id: string; title: string; error: string }>
}> {
  const store = getNewsFeedStore()
  const subs = store.listSubscriptions().filter(s => s.enabled)
  const errors: Array<{ id: string; title: string; error: string }> = []
  let refreshed = 0
  for (const sub of subs) {
    const r = await refreshSubscription(sub)
    if (r.error) errors.push({ id: sub.id, title: sub.title, error: r.error })
    else refreshed++
  }
  store.setRefreshedAt(new Date().toISOString())
  return { refreshed, errors }
}

export function shouldAutoRefresh(): boolean {
  const store = getNewsFeedStore()
  const settings = store.getSettings()
  const refreshedAt = store.getRefreshedAt()
  if (!refreshedAt) return true
  const ageMs = Date.now() - new Date(refreshedAt).getTime()
  return ageMs >= settings.refresh_interval_min * 60_000
}
