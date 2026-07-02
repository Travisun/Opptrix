import { getUserDataStore } from '@opptrix/user-store'
import type { ArticleEnrichment } from '@opptrix/news-feed'

const NS = 'news_enrichment'

export class EnrichmentStore {
  private get store() {
    return getUserDataStore()
  }

  get(articleId: string): ArticleEnrichment | undefined {
    return this.store.getDocument<ArticleEnrichment>(NS, articleId) ?? undefined
  }

  save(doc: ArticleEnrichment): ArticleEnrichment {
    this.store.setDocument(NS, doc.article_id, doc)
    return doc
  }

  delete(articleId: string): boolean {
    this.store.deleteDocument(NS, articleId)
    return true
  }

  listPendingArticleIds(allArticleIds: string[]): string[] {
    return allArticleIds.filter(id => {
      const cur = this.get(id)
      return !cur || cur.status === 'pending' || cur.status === 'failed'
    })
  }
}

let singleton: EnrichmentStore | null = null

export function getEnrichmentStore(): EnrichmentStore {
  if (!singleton) singleton = new EnrichmentStore()
  return singleton
}
