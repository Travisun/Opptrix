import { getArticle, getNewsSettings } from '@opptrix/news-feed'
import { BOOTSTRAP_MODEL_IDS, bootstrapModels } from '@opptrix/local-inference'
import { queueArticleEnrichment } from './enrichment-engine.js'
import { getEnrichmentStore } from './enrichment-store.js'

let schedulerTimer: ReturnType<typeof setInterval> | null = null
let schedulerRunning = false
let modelsBootstrapped = false

export function startEnrichmentScheduler(tickMs = 90_000, repoRoot?: string): void {
  if (schedulerTimer) return

  const tick = async () => {
    if (schedulerRunning) return
    schedulerRunning = true
    try {
      if (!modelsBootstrapped) {
        modelsBootstrapped = true
        void bootstrapModels(BOOTSTRAP_MODEL_IDS).catch(() => {})
        void import('@opptrix/local-inference').then(m => m.whisperRuntime.ensureModel('tiny')).catch(() => {})
      }

      const settings = getNewsSettings()
      if (!settings.enrichment?.enabled || settings.enrichment.processing_mode !== 'background') return

      const { getNewsFeedStore } = await import('@opptrix/news-feed')
      const store = getNewsFeedStore()
      const index = store.listArticlesPage({ limit: 30 })
      const enrichmentStore = getEnrichmentStore()
      const pendingIds = enrichmentStore.listPendingArticleIds(index.articles.map(a => a.id))

      for (const id of pendingIds.slice(0, 2)) {
        const article = getArticle(id)
        if (!article) continue
        const existing = enrichmentStore.get(id)
        if (existing?.status === 'running') continue
        await queueArticleEnrichment(article, settings.enrichment, repoRoot)
      }
    } catch {
      /* background */
    } finally {
      schedulerRunning = false
    }
  }

  void tick()
  schedulerTimer = setInterval(() => { void tick() }, tickMs)
}

export function stopEnrichmentScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
}
