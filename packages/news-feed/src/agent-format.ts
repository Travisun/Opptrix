import type { ArticleEnrichment, FeedArticle } from './types.js'

/** 压缩正文供 Agent 消费：去 HTML、合并空白与换行以节约 token */
export function compressNewsTextForAgent(raw: string): string {
  if (!raw.trim()) return ''
  const stripped = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  return stripped.replace(/\s+/g, ' ').trim()
}

export function summarizeArticleForAgent(article: FeedArticle) {
  const previewSource = article.summary || article.content_html || article.title
  const summaryPreview = compressNewsTextForAgent(previewSource).slice(0, 160)
  return {
    id: article.id,
    title: article.title,
    source_title: article.source_title,
    subscription_id: article.subscription_id,
    pub_date: article.pub_date,
    link: article.link,
    summary_preview: summaryPreview || undefined,
  }
}

export function formatArticleDetailForAgent(
  article: FeedArticle,
  enrichment?: ArticleEnrichment | null,
) {
  let bodyRaw = article.content_html || article.summary || ''
  if (enrichment?.segments?.length) {
    const derived = enrichment.segments.map(s => s.text).filter(Boolean).join('\n\n')
    bodyRaw = `${bodyRaw}\n\n${derived}`
  }
  const summaryRaw = article.summary || ''
  return {
    id: article.id,
    title: article.title,
    source_title: article.source_title,
    subscription_id: article.subscription_id,
    pub_date: article.pub_date,
    link: article.link,
    guid: article.guid,
    body_text: compressNewsTextForAgent(bodyRaw),
    summary_text: summaryRaw ? compressNewsTextForAgent(summaryRaw) : undefined,
    enrichment_status: enrichment?.status,
  }
}
