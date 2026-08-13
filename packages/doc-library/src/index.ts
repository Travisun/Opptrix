import type Database from 'better-sqlite3'
import {
  DocLibraryService,
  resolveLanceRebuildBackfillOptions,
} from './service.js'
import { openDocLibraryDb, docLibraryDbPath } from './paths.js'
import {
  closeVectorStore,
  setLanceRebuildBackfillHook,
} from './vector-store.js'
import { closeEmbeddingService } from './embedding.js'

export {
  DOC_LIBRARY_SCHEMA_VERSION,
  MIGRATION_V1_SQL,
  MIGRATION_V2_SQL,
  MIGRATION_V3_SQL,
  MIGRATION_V4_SQL,
  MIGRATION_V5_SQL,
  MIGRATION_V6_SQL,
} from './schema.js'
export {
  MIGRATION_STEPS,
  detectAppliedSchemaVersion,
  migrateDocLibrarySchema,
  DocLibrarySchemaMigrationError,
} from './schema-migrate.js'
export { DOC_LIBRARY_SCHEMA_VERSION as SCHEMA_VERSION } from './schema.js'
export type { SchemaMigrationStep } from './schema-migrate.js'
export * from './types.js'
export { documentKindFromMime, extOfFilename, isPlainTextDocument } from './document-kind.js'
export { DocLibraryRepository } from './repository.js'
export { DocLibraryService } from './service.js'
export type { LegacyExtractWriter, ParseLifecycleHooks, EmbedPendingOptions } from './service.js'
export { shouldEmbedToVector, resolveLanceRebuildBackfillOptions } from './service.js'
export {
  docLibraryRoot,
  docLibraryDbPath,
  blobPathForSha,
  markdownPathForDocument,
  embeddingModelsRoot,
  legacyEmbeddingModelsRoot,
  embeddingModelDir,
  getBundledEmbeddingModelDir,
  listEmbeddingModelSearchDirs,
  lanceDbDir,
  EMBEDDING_MODEL_ID,
  EMBEDDING_DIM,
  sha256Buffer,
  newDocumentId,
  ensureDocLibraryDirs,
  openDocLibraryDb,
} from './paths.js'
export type { EmbeddingModelSource } from './paths.js'
export { ftsQuery, replaceFtsForDocument, searchFtsChunks } from './fts.js'
export type { FtsSearchChunksOpts, FtsSearchRow } from './fts.js'
export type { HybridSearchChunksOpts } from './hybrid-search.js'
export {
  listLibraryDocumentIds,
  iterateLibraryDocumentIdPages,
  LIBRARY_DOCUMENT_ID_PAGE_SIZE,
} from './hybrid-search.js'
export { rrfFuse } from './rrf.js'
export {
  EmbeddingService,
  MockEmbeddingBackend,
  TransformersE5Backend,
  getEmbeddingService,
  closeEmbeddingService,
  setEmbeddingServiceForTests,
  resolveEmbedIdleMs,
  DEFAULT_EMBED_IDLE_MS,
  resolveEmbedBatchSize,
  DEFAULT_EMBED_BATCH_SIZE,
  MIN_EMBED_BATCH_SIZE,
  MAX_EMBED_BATCH_SIZE,
} from './embedding.js'
export type { EmbeddingBackend } from './embedding.js'
export {
  LanceVectorStore,
  MemoryVectorStore,
  LanceOpScheduler,
  getVectorStore,
  closeVectorStore,
  setVectorStoreForTests,
  setLanceRebuildBackfillHook,
  getLanceRebuildBackfillHook,
  isValidEmbeddingVector,
  filterValidUpsertRows,
  detectLanceDatasetPathology,
  lanceTableDatasetDir,
  LANCE_VERSIONS_PATHOLOGY_THRESHOLD,
} from './vector-store.js'
export type {
  VectorStore,
  VectorChunkRow,
  VectorSearchHit,
  LancePathologyResult,
  LanceScheduleKind,
  LanceRebuildBackfillHook,
} from './vector-store.js'
export {
  downloadEmbeddingModel,
  removeEmbeddingModel,
  isEmbeddingModelInstalled,
  getEmbeddingModelStatus,
  resolveEmbeddingModelDir,
  verifyEmbeddingModel,
  E5_MODEL_FILES,
} from './model-downloader.js'
export type { DownloadProgress, EmbeddingModelStatus } from './model-downloader.js'
export {
  getSemanticModelStatus,
  installSemanticModel,
  uninstallSemanticModel,
} from './embedding-api.js'
export type { SemanticModelUiStatus } from './embedding-api.js'
export {
  selectEngine,
  ParseRouter,
} from './parse-router.js'
export type { SelectEngineInput, ParseRouterDeps } from './parse-router.js'
export {
  isWeakText,
  metricsFromParseResult,
  pickBetterResult,
  WEAK_ABS_CHAR_COUNT,
  WEAK_CHARS_PER_PAGE,
  WEAK_EMPTY_PAGE_RATIO,
} from './parse-quality.js'
export type { ParseQualityMetrics } from './parse-quality.js'
export {
  createTextL0Runner,
  TEXT_L0_ENGINE_VERSION,
  extractTextL0,
  decodeTextBuffer,
} from './engines/text-l0.js'
export {
  createOfficeL0Runner,
  OFFICE_L0_ENGINE_VERSION,
  extractDocxL0,
  extractDocL0,
  extractPptxL0,
  extractPptL0,
} from './engines/office-l0.js'
export {
  createOcrL2Runner,
  createRapidOcrL2Runner,
  getOcrL2Status,
  getRapidOcrStatus,
  isOcrL2Available,
  isRapidOcrAvailable,
  prepareOcrL2Install,
  prepareRapidOcrInstall,
  markOcrL2Ready,
  markRapidOcrReady,
  removeOcrL2Install,
  removeRapidOcrInstall,
  resolveRapidOcrModelDir,
  missingRapidOcrModelFiles,
  ensureRapidOcrModelsDownloaded,
  OCR_L2_ENGINE_VERSION,
  RAPIDOCR_ENGINE_VERSION,
  RAPIDOCR_MODEL_FILES,
  runOcrL2,
  ocrImageBuffer,
  ocrImageBuffers,
} from './engines/ocr-l2.js'
export type { OcrEngineStatus, RapidOcrStatus, OcrBatchOpts } from './engines/ocr-l2.js'
export {
  enhancePagesWithEmbeddedImageOcr,
  enhanceParseResultWithEmbeddedImages,
  pagesToParseResult,
  mergeImageOcrIntoPages,
  formatImageOcrBlocks,
  extractDocxEmbeddedImages,
  extractPptxEmbeddedImages,
  extractPdfEmbeddedImages,
  ocrEmbeddedMediaBatch,
  sha256Of,
  IMAGE_OCR_MARKER,
  MAX_EMBEDDED_IMAGES,
  MIN_IMAGE_BYTES,
  MIN_IMAGE_EDGE,
  EMBEDDED_OCR_TIMEOUT_MS,
  OCR_CONCURRENCY,
  OCR_CONCURRENCY_DEFAULT,
  OCR_CONCURRENCY_LOW,
  OCR_CONCURRENCY_MAX,
  OCR_CONCURRENCY_WITH_EMBEDDING,
  resolveOcrConcurrency,
} from './engines/embedded-images/index.js'
export type {
  EmbeddedMedia,
  EmbeddedImageFormat,
  OcrImageFn,
  PageText,
  EnhanceEmbeddedOcrOpts,
  ResolveOcrConcurrencyOpts,
} from './engines/embedded-images/index.js'
export {
  createUnlimitedOcrL2Runner,
  getUnlimitedOcrStatus,
  isUnlimitedOcrAvailable,
  prepareUnlimitedOcrInstall,
  markUnlimitedOcrReady,
  removeUnlimitedOcrInstall,
  UNLIMITED_OCR_ENGINE_VERSION,
} from './engines/unlimited-ocr-l2.js'
export type { UnlimitedOcrStatus } from './engines/unlimited-ocr-l2.js'
/** @deprecated pdfplumber L1 已移除；保留导出以免旧 import 炸 */
export {
  createPdfplumberL1Runner,
  getPdfplumberStatus,
  isPdfplumberAvailable,
  preparePdfplumberInstall,
  removePdfplumberInstall,
  PDFPLUMBER_ENGINE_VERSION,
} from './engines/pdfplumber-l1.js'
export type { PdfplumberStatus } from './engines/pdfplumber-l1.js'
export {
  getParseEnginesStatus,
  prepareLayoutEngine,
  uninstallLayoutEngine,
  prepareDeepEngine,
  markDeepEngineReady,
  uninstallDeepEngine,
  ensureBundledRagRuntime,
} from './engines-api.js'
export type { ParseEnginesUiStatus } from './engines-api.js'
export {
  enginesRoot,
  pdfplumberWorkerDir,
  unlimitedOcrDir,
  rapidocrWorkerDir,
  rapidocrUserModelDir,
  getBundledRapidOcrModelDir,
  listRapidOcrModelSearchDirs,
  getBundledEnginesRoot,
  getBundledEngineDir,
  platformEnginesKey,
  RAPIDOCR_MODEL_ID,
} from './paths.js'
export type { RapidOcrModelSource, RagEngineId } from './paths.js'

let serviceInst: DocLibraryService | null = null
let serviceDb: Database.Database | null = null

/** 将 Lance 病理重建成功挂钩到限速 embedPending（排除 news） */
export function wireLanceRebuildBackfill(svc: DocLibraryService): void {
  setLanceRebuildBackfillHook(async () => {
    try {
      const opts = resolveLanceRebuildBackfillOptions()
      const batch = opts.limit ?? 8
      const maxRoundsRaw = process.env.OPPTRIX_LANCE_BACKFILL_MAX_ROUNDS
      const maxRoundsParsed = maxRoundsRaw != null && maxRoundsRaw !== ''
        ? Number(maxRoundsRaw)
        : 32
      const maxRounds = Number.isFinite(maxRoundsParsed) && maxRoundsParsed > 0
        ? Math.floor(maxRoundsParsed)
        : 32
      let first = true
      for (let round = 0; round < maxRounds; round++) {
        const n = await svc.embedPendingDocuments({
          ...opts,
          resetEmbeddedFlags: first,
        })
        first = false
        if (n < batch) break
        if ((opts.delayMs ?? 0) > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, opts.delayMs))
        }
      }
    } catch {
      /* 回填失败不阻断打开空表 */
    }
  })
}

/** 生产单例；测试可传 dbPath 隔离 */
export function getDocLibraryService(dbPath?: string): DocLibraryService {
  if (dbPath) {
    const db = openDocLibraryDb(dbPath)
    return new DocLibraryService(db)
  }
  if (!serviceInst) {
    serviceDb = openDocLibraryDb()
    serviceInst = new DocLibraryService(serviceDb)
    wireLanceRebuildBackfill(serviceInst)
  }
  return serviceInst
}

/**
 * 关闭文档库单例：先 Lance 向量库，再 embedding 模型，最后 SQLite。
 * 生产 sidecar 退出与测试 teardown 共用；失败不抛。
 */
export async function closeDocLibraryService(): Promise<void> {
  try {
    setLanceRebuildBackfillHook(null)
  } catch {
    /* ignore */
  }
  try {
    await closeVectorStore()
  } catch {
    /* ignore */
  }
  try {
    await closeEmbeddingService()
  } catch {
    /* ignore */
  }
  try {
    serviceDb?.close()
  } catch {
    /* ignore */
  }
  serviceDb = null
  serviceInst = null
}

export function resetDocLibraryServiceForTests(): void {
  void closeDocLibraryService()
}
