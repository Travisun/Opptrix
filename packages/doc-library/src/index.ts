import type Database from 'better-sqlite3'
import { DocLibraryService } from './service.js'
import { openDocLibraryDb, docLibraryDbPath } from './paths.js'
import { closeVectorStore } from './vector-store.js'

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
export type { LegacyExtractWriter, ParseLifecycleHooks } from './service.js'
export { shouldEmbedToVector } from './embed-policy.js'
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
export { rrfFuse } from './rrf.js'
export {
  EmbeddingService,
  MockEmbeddingBackend,
  TransformersE5Backend,
  getEmbeddingService,
  closeEmbeddingService,
  setEmbeddingServiceForTests,
} from './embedding.js'
export type { EmbeddingBackend } from './embedding.js'
export {
  LanceVectorStore,
  MemoryVectorStore,
  getVectorStore,
  closeVectorStore,
  setVectorStoreForTests,
  isValidEmbeddingVector,
  filterValidUpsertRows,
  detectLanceDatasetPathology,
  lanceTableDatasetDir,
  LANCE_VERSIONS_PATHOLOGY_THRESHOLD,
} from './vector-store.js'
export type { VectorStore, VectorChunkRow, VectorSearchHit, LancePathologyResult } from './vector-store.js'
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
} from './engines/embedded-images/index.js'
export type {
  EmbeddedMedia,
  EmbeddedImageFormat,
  OcrImageFn,
  PageText,
  EnhanceEmbeddedOcrOpts,
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

/** 生产单例；测试可传 dbPath 隔离 */
export function getDocLibraryService(dbPath?: string): DocLibraryService {
  if (dbPath) {
    const db = openDocLibraryDb(dbPath)
    return new DocLibraryService(db)
  }
  if (!serviceInst) {
    serviceDb = openDocLibraryDb()
    serviceInst = new DocLibraryService(serviceDb)
  }
  return serviceInst
}

/**
 * 关闭文档库单例：先 Lance 向量库，再 SQLite。
 * 生产 sidecar 退出与测试 teardown 共用；失败不抛。
 */
export async function closeDocLibraryService(): Promise<void> {
  try {
    await closeVectorStore()
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
