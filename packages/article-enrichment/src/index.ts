export { scanHtmlMedia, type ScannedMedia, type MediaKind } from './html-media-scan.js'
export { fetchMediaToCache } from './media-fetch.js'
export { EnrichmentStore, getEnrichmentStore, setEnrichmentPersistHook } from './enrichment-store.js'
export {
  enrichArticle,
  queueArticleEnrichment,
  canEnrichWithSettings,
  isRemoteVisionConfigured,
  type EnrichmentProgress,
} from './enrichment-engine.js'
export {
  buildArticleTextLayer,
  buildArticlePlainTextForAgent,
  buildArticlePlainTextForTranslation,
  mergeEnrichmentSegments,
  extractHtmlTextBlocksFromString,
  type TextLayerBlock,
} from './enrichment-text.js'
export { startEnrichmentScheduler, stopEnrichmentScheduler } from './scheduler.js'
