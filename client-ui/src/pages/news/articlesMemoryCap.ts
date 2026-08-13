/**
 * Hard cap for in-memory timeline articles (newest-first).
 * Prevents unbounded append while browsing / loadMore.
 */
export const NEWS_ARTICLES_MEMORY_CAP = 800

/**
 * Keep at most `cap` articles (pub_date desc → drop oldest from the tail).
 */
export function applyArticlesMemoryCap<T>(
  articles: readonly T[],
  cap: number = NEWS_ARTICLES_MEMORY_CAP,
): { articles: T[]; capped: boolean } {
  if (!Number.isFinite(cap) || cap <= 0) {
    return { articles: [...articles], capped: false }
  }
  if (articles.length <= cap) {
    return { articles: [...articles], capped: false }
  }
  return { articles: articles.slice(0, cap), capped: true }
}
