import type { FeedArticle } from '@opptrix/news-feed'
import type { ArticleEnrichment } from '@opptrix/news-feed'
import { getUserDataStore } from '@opptrix/user-store'

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildNewsSearchBody(
  article: FeedArticle,
  enrichment?: ArticleEnrichment | null,
): string {
  const parts: string[] = []
  if (article.summary?.trim()) parts.push(article.summary.trim())
  if (article.content_html?.trim()) parts.push(stripHtml(article.content_html))
  if (enrichment?.segments?.length) {
    for (const seg of enrichment.segments) {
      if (seg.text?.trim()) parts.push(seg.text.trim())
    }
  }
  return parts.join('\n')
}

export function syncNewsSearchIndex(
  article: FeedArticle,
  enrichment?: ArticleEnrichment | null,
) {
  getUserDataStore().indexNewsSearch({
    article_id: article.id,
    title: article.title,
    body: buildNewsSearchBody(article, enrichment),
    pub_date: article.pub_date,
    source_title: article.source_title,
  })
}

export function removeNewsSearchIndex(articleId: string) {
  getUserDataStore().removeNewsSearch(articleId)
}

export function rebuildNewsSearchIndex(
  articles: FeedArticle[],
  enrichmentById: Map<string, ArticleEnrichment>,
) {
  const store = getUserDataStore()
  store.clearNewsSearchIndex()
  for (const article of articles) {
    syncNewsSearchIndex(article, enrichmentById.get(article.id))
  }
}
