import { getArticle, getNewsSettings } from '@opptrix/news-feed'
import { queueArticleEnrichment, canEnrichWithSettings } from './enrichment-engine.js'
import { getEnrichmentStore } from './enrichment-store.js'
import {
  getMultimodalRuntimeStatus,
  isWhisperModelInstalled,
  shouldBootstrapWhisper,
  whisperRuntime,
} from '@opptrix/local-inference'

let schedulerTimer: ReturnType<typeof setInterval> | null = null
let schedulerRunning = false

export function startEnrichmentScheduler(tickMs = 90_000, repoRoot?: string): void {
  if (schedulerTimer) return

  const tick = async () => {
    if (schedulerRunning) return
    schedulerRunning = true
    try {
      const settings = getNewsSettings()
      const enrichment = settings.enrichment
      if (shouldBootstrapWhisper(enrichment)) {
        const whisperModel = enrichment.offline_whisper_model?.trim() || 'tiny'
        if (!isWhisperModelInstalled(whisperModel)) {
          void whisperRuntime.ensureModel(whisperModel).catch(() => {})
        }
      }

      if (!enrichment.enabled || enrichment.processing_mode !== 'background') return

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
