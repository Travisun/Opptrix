import type {
  FeedArticle,
  FeedGroup,
  FeedSubscription,
  NewsGroupedFeed,
} from '../../types/schemas'

export type NewsFilterOption = {
  id: string
  title: string
}

export function buildGroupFilterOptions(
  groups: FeedGroup[],
  grouped: NewsGroupedFeed | null,
): NewsFilterOption[] {
  if (grouped) {
    const fromGrouped: NewsFilterOption[] = grouped.groups.map(g => ({
      id: g.id,
      title: g.title,
    }))
    if (grouped.ungrouped.length > 0) {
      fromGrouped.push({ id: '__ungrouped__', title: '未分组' })
    }
    if (fromGrouped.length > 0) return fromGrouped
  }

  const fromMeta = groups.map(g => ({ id: g.id, title: g.title }))
  if (fromMeta.length > 0) return fromMeta
  return [{ id: '__ungrouped__', title: '未分组' }]
}

export function buildSourceFilterOptions(
  subscriptions: FeedSubscription[],
  grouped: NewsGroupedFeed | null,
): NewsFilterOption[] {
  if (grouped?.by_source.length) {
    return grouped.by_source.map(s => ({
      id: s.subscription_id,
      title: s.title,
    }))
  }
  const enabled = subscriptions.filter(s => s.enabled)
  const list = enabled.length > 0 ? enabled : subscriptions
  return list.map(s => ({ id: s.id, title: s.title }))
}

export function defaultGroupFilterId(
  groups: FeedGroup[],
  grouped: NewsGroupedFeed | null,
): string | null {
  const options = buildGroupFilterOptions(groups, grouped)
  return options[0]?.id ?? null
}

export function defaultSourceFilterId(
  subscriptions: FeedSubscription[],
  grouped: NewsGroupedFeed | null,
): string | null {
  const options = buildSourceFilterOptions(subscriptions, grouped)
  return options[0]?.id ?? null
}

export function resolveGroupFilterId(
  groups: FeedGroup[],
  grouped: NewsGroupedFeed | null,
  current: string | null,
): string | null {
  const options = buildGroupFilterOptions(groups, grouped)
  if (!options.length) return null
  if (current && options.some(o => o.id === current)) return current
  return options[0]?.id ?? null
}

export function resolveSourceFilterId(
  subscriptions: FeedSubscription[],
  grouped: NewsGroupedFeed | null,
  current: string | null,
): string | null {
  const options = buildSourceFilterOptions(subscriptions, grouped)
  if (!options.length) return null
  if (current && options.some(o => o.id === current)) return current
  return options[0]?.id ?? null
}

function dedupeArticles(items: FeedArticle[]): FeedArticle[] {
  const seen = new Set<string>()
  const out: FeedArticle[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export function articlesForGroupFilter(
  grouped: NewsGroupedFeed,
  groupFilterId: string,
  subscriptions: FeedSubscription[],
): FeedArticle[] {
  if (groupFilterId === '__ungrouped__') return grouped.ungrouped

  const section = grouped.groups.find(g => g.id === groupFilterId)
  if (section) return section.articles

  const subIds = new Set(
    subscriptions
      .filter(s => s.group_id === groupFilterId)
      .map(s => s.id),
  )
  if (!subIds.size) return []

  return dedupeArticles([
    ...grouped.by_source.flatMap(s => s.articles),
    ...grouped.ungrouped,
  ].filter(a => subIds.has(a.subscription_id)))
}

export function articlesForSourceFilter(
  grouped: NewsGroupedFeed,
  sourceFilterId: string,
): FeedArticle[] {
  return grouped.by_source.find(s => s.subscription_id === sourceFilterId)?.articles ?? []
}

/** Degraded grouped payload from timeline + meta when /feed/grouped is unavailable. */
export function buildGroupedFeedFallback(
  articles: FeedArticle[],
  subscriptions: FeedSubscription[],
  groups: FeedGroup[],
): NewsGroupedFeed {
  const bySub = new Map<string, FeedArticle[]>()
  for (const sub of subscriptions) bySub.set(sub.id, [])
  for (const article of articles) {
    bySub.get(article.subscription_id)?.push(article)
  }

  const by_source = subscriptions
    .map(sub => ({
      subscription_id: sub.id,
      title: sub.title,
      articles: bySub.get(sub.id) ?? [],
    }))
    .filter(s => s.articles.length > 0)

  const groupedSections = groups
    .map(g => {
      const subIds = new Set(subscriptions.filter(s => s.group_id === g.id).map(s => s.id))
      return {
        id: g.id,
        title: g.title,
        articles: articles.filter(a => subIds.has(a.subscription_id)),
      }
    })
    .filter(g => g.articles.length > 0)

  const ungroupedSubIds = new Set(subscriptions.filter(s => !s.group_id).map(s => s.id))
  const ungrouped = articles.filter(a => ungroupedSubIds.has(a.subscription_id))

  return { groups: groupedSections, ungrouped, by_source }
}
