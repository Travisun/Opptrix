import type { ArticleEnrichment, FeedArticle } from '@opptrix/news-feed'
import { getEnrichmentStore } from '@opptrix/article-enrichment'
import { getUserDataStore, type DocumentPageCursor } from '@opptrix/user-store'

const NEWS_ARTICLE_NS = 'news_article'
const NEWS_REBUILD_PAGE = 50

/** 轻量投影：覆盖 buildNewsSearchBody 所需字段（含正文 HTML），不解析整篇 JSON 对象图。 */
const NEWS_FTS_EXTRACT_PATHS = [
  '$.title',
  '$.summary',
  '$.content_html',
  '$.pub_date',
  '$.source_title',
] as const

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

function asOptionalString(v: string | number | boolean | null): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asString(v: string | number | boolean | null): string {
  return typeof v === 'string' ? v : ''
}

function articleFromExtract(
  id: string,
  values: Array<string | number | boolean | null>,
): FeedArticle {
  const [title, summary, contentHtml, pubDate, sourceTitle] = values
  return {
    id,
    subscription_id: '',
    title: asString(title),
    link: '',
    pub_date: asString(pubDate),
    summary: asOptionalString(summary),
    content_html: asOptionalString(contentHtml),
    source_title: asString(sourceTitle),
  }
}

/** 按页投影 → upsert → 丢弃页，不驻留 articles[] / enrichmentMap。 */
function rebuildNewsSearchIndexPaged() {
  const store = getUserDataStore()
  const enrichmentStore = getEnrichmentStore()
  let after: DocumentPageCursor | undefined
  for (;;) {
    const page = store.listDocumentExtractPage(NEWS_ARTICLE_NS, [...NEWS_FTS_EXTRACT_PATHS], {
      limit: NEWS_REBUILD_PAGE,
      after,
    })
    if (!page.length) break
    for (const row of page) {
      const article = articleFromExtract(row.id, row.values)
      syncNewsSearchIndex(article, enrichmentStore.get(row.id))
    }
    const last = page[page.length - 1]
    after = { updatedAt: last.updated_at, id: last.id }
    if (page.length < NEWS_REBUILD_PAGE) break
  }
}

/**
 * 重建资讯 FTS。无参时分页投影灌入；传入数组时保持旧批处理语义。
 */
export function rebuildNewsSearchIndex(
  articles?: FeedArticle[],
  enrichmentById?: Map<string, ArticleEnrichment>,
) {
  const store = getUserDataStore()
  store.clearNewsSearchIndex()
  if (articles) {
    for (const article of articles) {
      syncNewsSearchIndex(article, enrichmentById?.get(article.id))
    }
    return
  }
  rebuildNewsSearchIndexPaged()
}
