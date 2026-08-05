/**
 * 将资讯正文写入 doc-library（source_type=news），受 generateForNews 开关入队建图。
 * 失败不阻断新闻持久化 / 搜索索引。
 */
import type { FeedArticle } from '@opptrix/news-feed'
import { compressNewsTextForAgent } from '@opptrix/news-feed'

function articlePlainText(article: FeedArticle): string {
  const parts = [
    article.title,
    article.summary,
    article.content_html,
  ].filter((p): p is string => Boolean(p && String(p).trim()))
  return compressNewsTextForAgent(parts.join('\n\n'))
}

/** 单篇资讯入库；异步 embed/建图在 service 内触发 */
export function ingestNewsArticleToDocLibrary(article: FeedArticle): void {
  try {
    const text = articlePlainText(article)
    if (text.length < 24) return
    // 动态 import 避免 server 冷启动强依赖 doc-library 初始化顺序
    void import('@opptrix/doc-library').then((mod) => {
      try {
        const svc = mod.getDocLibraryService()
        svc.ingestFromText({
          text,
          name: (article.title || article.id).slice(0, 200),
          sourceType: 'news',
          externalId: article.id,
          mime: 'text/plain',
        })
      } catch {
        /* 入库失败不阻断资讯流 */
      }
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
