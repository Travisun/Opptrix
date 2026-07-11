import type { FeedArticle, NewsEnrichmentSettings, NewsSettings, NewsTranslationSettings } from './types.js'
import { DEFAULT_ENRICHMENT_SETTINGS, DEFAULT_NEWS_SETTINGS, DEFAULT_TRANSLATION_SETTINGS } from './types.js'

/** 单次 RSS 拉取解析的最大条目（仅限制网络解析，不限制本地存储） */
export const MAX_ARTICLES_PER_FETCH = 200

export function normalizeTranslationSettings(
  raw?: Partial<NewsTranslationSettings> | null,
): NewsTranslationSettings {
  const merged = { ...DEFAULT_TRANSLATION_SETTINGS, ...raw }
  const offlineModel = String(merged.offline_model ?? '__auto__').trim() || '__auto__'
  const remoteModel = merged.remote_model == null
    ? null
    : String(merged.remote_model).trim() || null

  return {
    service_mode: merged.service_mode === 'remote' ? 'remote' : 'offline',
    offline_model: offlineModel,
    remote_provider_id: merged.remote_provider_id ?? null,
    remote_model: remoteModel,
  }
}

export function normalizeEnrichmentSettings(
  raw?: Partial<NewsEnrichmentSettings> | null,
): NewsEnrichmentSettings {
  const merged = { ...DEFAULT_ENRICHMENT_SETTINGS, ...raw }
  let processingMode = merged.processing_mode
  if (processingMode !== 'on_demand' && processingMode !== 'background') {
    processingMode = merged.auto_on_refresh === true ? 'background' : 'on_demand'
  }
  const offlineVision = String(merged.offline_vision_model ?? '__auto__').trim() || '__auto__'
  const offlineWhisper = String(merged.offline_whisper_model ?? 'tiny').trim() || 'tiny'
  const remoteModel = merged.remote_model == null
    ? null
    : String(merged.remote_model).trim() || null

  return {
    enabled: merged.enabled === true,
    processing_mode: processingMode,
    extract_images: merged.extract_images !== false,
    extract_audio: merged.extract_audio !== false,
    extract_video: merged.extract_video !== false,
    service_mode: merged.service_mode === 'remote' ? 'remote' : 'offline',
    offline_vision_model: offlineVision,
    offline_whisper_model: offlineWhisper,
    remote_provider_id: merged.remote_provider_id ?? null,
    remote_model: remoteModel,
  }
}

export function normalizeNewsSettings(raw?: Partial<NewsSettings> | null): NewsSettings {
  const merged = { ...DEFAULT_NEWS_SETTINGS, ...raw }
  const retention = merged.retention_years
  const maxRaw = merged.max_articles

  return {
    refresh_interval_min: Math.max(5, Math.min(120, merged.refresh_interval_min || 15)),
    retention_years: retention === 0
      ? 0
      : Math.max(1, Math.min(20, retention ?? DEFAULT_NEWS_SETTINGS.retention_years)),
    max_articles: maxRaw == null || maxRaw <= 0
      ? null
      : Math.min(1_000_000, Math.floor(maxRaw)),
    translation: normalizeTranslationSettings(merged.translation),
    enrichment: normalizeEnrichmentSettings(merged.enrichment),
  }
}

export function retentionCutoffDate(settings: NewsSettings): Date | null {
  if (settings.retention_years <= 0) return null
  const d = new Date()
  d.setFullYear(d.getFullYear() - settings.retention_years)
  return d
}

export function sortArticlesByPubDate(articles: FeedArticle[]): FeedArticle[] {
  return articles.slice().sort((a, b) => {
    const dt = new Date(b.pub_date).getTime() - new Date(a.pub_date).getTime()
    if (dt !== 0) return dt
    return b.id.localeCompare(a.id)
  })
}

/** 按发布时间保留最新文章；超出年限或数量上限的删除 */
export function selectRetainedArticles(
  articles: FeedArticle[],
  settings: NewsSettings,
): FeedArticle[] {
  const normalized = normalizeNewsSettings(settings)
  let kept = sortArticlesByPubDate(articles)

  const cutoff = retentionCutoffDate(normalized)
  if (cutoff) {
    const minTs = cutoff.getTime()
    kept = kept.filter(a => {
      const ts = new Date(a.pub_date).getTime()
      return Number.isFinite(ts) && ts >= minTs
    })
  }

  if (normalized.max_articles != null && kept.length > normalized.max_articles) {
    kept = kept.slice(0, normalized.max_articles)
  }

  return kept
}
