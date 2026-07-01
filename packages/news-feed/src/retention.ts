import type { FeedArticle, NewsSettings } from './types.js'
import { DEFAULT_NEWS_SETTINGS } from './types.js'

/** 单次 RSS 拉取解析的最大条目（仅限制网络解析，不限制本地存储） */
export const MAX_ARTICLES_PER_FETCH = 200

export function normalizeNewsSettings(raw?: Partial<NewsSettings> | null): NewsSettings {
  const merged = { ...DEFAULT_NEWS_SETTINGS, ...raw }
  const retention = merged.retention_years
  const maxRaw = merged.max_articles

  return {
    refresh_interval_min: Math.max(5, Math.min(120, merged.refresh_interval_min || 15)),
    retention_years: retention === 0
      ? 0
      : Math.max(1, Math.min(20, retention ?? DEFAULT_NEWS_SETTINGS.retention_years)),
    max_articles: maxRaw == null || maxRaw <= 0
      ? null
      : Math.min(1_000_000, Math.floor(maxRaw)),
  }
}

export function retentionCutoffDate(settings: NewsSettings): Date | null {
  if (settings.retention_years <= 0) return null
  const d = new Date()
  d.setFullYear(d.getFullYear() - settings.retention_years)
  return d
}

export function sortArticlesByPubDate(articles: FeedArticle[]): FeedArticle[] {
  return articles.slice().sort((a, b) => {
    const dt = new Date(b.pub_date).getTime() - new Date(a.pub_date).getTime()
    if (dt !== 0) return dt
    return b.id.localeCompare(a.id)
  })
}

/** 按发布时间保留最新文章；超出年限或数量上限的删除 */
export function selectRetainedArticles(
  articles: FeedArticle[],
  settings: NewsSettings,
): FeedArticle[] {
  const normalized = normalizeNewsSettings(settings)
  let kept = sortArticlesByPubDate(articles)

  const cutoff = retentionCutoffDate(normalized)
  if (cutoff) {
    const minTs = cutoff.getTime()
    kept = kept.filter(a => {
      const ts = new Date(a.pub_date).getTime()
      return Number.isFinite(ts) && ts >= minTs
    })
  }

  if (normalized.max_articles != null && kept.length > normalized.max_articles) {
    kept = kept.slice(0, normalized.max_articles)
  }

  return kept
}
