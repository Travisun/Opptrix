import type { FeedArticle } from './types.js'
import { extractTwitterStatusId } from './twitter-guid.js'

function stripTitleHtml(title: string): string {
  return title.replace(/<[^>]+>/g, '')
}

/** Normalize titles for cross-source duplicate detection on the timeline. */
export function normalizeArticleTitle(title: string): string {
  let t = stripTitleHtml(title)
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
  // Common CN feed prefixes: 【财经】【快讯】
  t = t.replace(/^(\s*【[^】]{1,16}】\s*)+/, '')
  return t.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN')
}

export function articleTitleDedupeKey(article: Pick<FeedArticle, 'id' | 'title'>): string {
  const normalized = normalizeArticleTitle(article.title)
  return normalized || `__id:${article.id}`
}

/** Per-subscription dedupe: Twitter status id when present, else normalized title. */
export function articleContentDedupeKey(
  article: Pick<FeedArticle, 'id' | 'title' | 'link' | 'guid'>,
): string {
  const statusId =
    extractTwitterStatusId(article.guid ?? '') ?? extractTwitterStatusId(article.link ?? '')
  if (statusId) return `twitter:status:${statusId}`
  return articleTitleDedupeKey(article)
}

/** Keep first occurrence per title (caller should pass pub_date-desc ids). */
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

export function dedupeArticleIdsByTitle(
  ids: string[],
  getArticle: (id: string) => FeedArticle | null | undefined,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const article = getArticle(id)
    if (!article) continue
    const key = articleTitleDedupeKey(article)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(id)
  }
  return result
}

export function dedupeArticleIdsByContentKey(
  ids: string[],
  getArticle: (id: string) => FeedArticle | null | undefined,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const article = getArticle(id)
    if (!article) continue
    const key = articleContentDedupeKey(article)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(id)
  }
  return result
}
