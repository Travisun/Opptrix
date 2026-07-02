import type { ArticleDerivedSegment, ArticleEnrichment, FeedArticle } from '@opptrix/news-feed'
import { compressNewsTextForAgent } from '@opptrix/news-feed'

export type TextLayerBlock = {
  id: string
  text: string
  kind: 'text' | 'html' | 'derived'
  derivedKind?: ArticleDerivedSegment['kind']
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 浏览器环境：从 DOM 提取可翻译块（供 client 复用逻辑时参考） */
export function extractHtmlTextBlocksFromString(html: string): TextLayerBlock[] {
  // 服务端无 DOM：粗粒度去标签分段
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
  const parts = stripped.split(/\n+/).map(normalizeText).filter(t => t.length >= 8)
  return parts.map((text, i) => ({
    id: `html:${i}`,
    text,
    kind: 'text' as const,
  }))
}

export function mergeEnrichmentSegments(
  htmlBlocks: TextLayerBlock[],
  enrichment?: ArticleEnrichment | null,
): TextLayerBlock[] {
  if (!enrichment?.segments?.length) return htmlBlocks

  const derived: TextLayerBlock[] = enrichment.segments.map(seg => ({
    id: seg.id,
    text: seg.text,
    kind: 'derived',
    derivedKind: seg.kind,
  }))

  return [...htmlBlocks, ...derived]
}

export function buildArticleTextLayer(
  article: FeedArticle,
  enrichment?: ArticleEnrichment | null,
): TextLayerBlock[] {
  const html = article.content_html || article.summary || ''
  const htmlBlocks = extractHtmlTextBlocksFromString(html)
  return mergeEnrichmentSegments(htmlBlocks, enrichment)
}

export function buildArticlePlainTextForAgent(
  article: FeedArticle,
  enrichment?: ArticleEnrichment | null,
): string {
  const layer = buildArticleTextLayer(article, enrichment)
  const joined = layer.map(b => b.text).filter(Boolean).join('\n\n')
  return compressNewsTextForAgent(joined)
}

export function buildArticlePlainTextForTranslation(
  article: FeedArticle,
  enrichment?: ArticleEnrichment | null,
): string {
  const layer = buildArticleTextLayer(article, enrichment)
  return layer.map(b => b.text).filter(Boolean).join('\n\n')
}
