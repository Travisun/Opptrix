import type Database from 'better-sqlite3'
import { DocLibraryService } from './service.js'
import { openDocLibraryDb, docLibraryDbPath } from './paths.js'

export { DOC_LIBRARY_SCHEMA_VERSION, MIGRATION_V1_SQL, MIGRATION_V2_SQL } from './schema.js'
export {
  MIGRATION_STEPS,
  detectAppliedSchemaVersion,
  migrateDocLibrarySchema,
  DocLibrarySchemaMigrationError,
} from './schema-migrate.js'
export { DOC_LIBRARY_SCHEMA_VERSION as SCHEMA_VERSION } from './schema.js'
export type { SchemaMigrationStep } from './schema-migrate.js'
export * from './types.js'
export { DocLibraryRepository } from './repository.js'
export { DocLibraryService } from './service.js'
export type { LegacyExtractWriter, ParseLifecycleHooks } from './service.js'
export {
  docLibraryRoot,
  docLibraryDbPath,
  blobPathForSha,
  markdownPathForDocument,
  embeddingModelsRoot,
  embeddingModelDir,
  lanceDbDir,
  EMBEDDING_MODEL_ID,
  EMBEDDING_DIM,
  sha256Buffer,
  newDocumentId,
  ensureDocLibraryDirs,
  openDocLibraryDb,
} from './paths.js'
export { ftsQuery, replaceFtsForDocument, searchFtsChunks } from './fts.js'
export { rrfFuse } from './rrf.js'
export {
  EmbeddingService,
  MockEmbeddingBackend,
  TransformersE5Backend,
  getEmbeddingService,
  setEmbeddingServiceForTests,
} from './embedding.js'
export type { EmbeddingBackend } from './embedding.js'
export {
  LanceVectorStore,
  MemoryVectorStore,
  getVectorStore,
  setVectorStoreForTests,
} from './vector-store.js'
export type { VectorStore, VectorChunkRow, VectorSearchHit } from './vector-store.js'
export {
  downloadEmbeddingModel,
  removeEmbeddingModel,
  isEmbeddingModelInstalled,
  getEmbeddingModelStatus,
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
  createPdfplumberL1Runner,
  getPdfplumberStatus,
  isPdfplumberAvailable,
  preparePdfplumberInstall,
  removePdfplumberInstall,
  PDFPLUMBER_ENGINE_VERSION,
} from './engines/pdfplumber-l1.js'
export type { PdfplumberStatus } from './engines/pdfplumber-l1.js'
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
export {
  getParseEnginesStatus,
  prepareLayoutEngine,
  uninstallLayoutEngine,
  prepareDeepEngine,
  markDeepEngineReady,
  uninstallDeepEngine,
} from './engines-api.js'
export type { ParseEnginesUiStatus } from './engines-api.js'
export {
  enginesRoot,
  pdfplumberWorkerDir,
  unlimitedOcrDir,
} from './paths.js'

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

/** 测试 teardown */
export function closeDocLibraryService(): void {
  serviceDb?.close()
  serviceDb = null
  serviceInst = null
}

export function resetDocLibraryServiceForTests(): void {
  closeDocLibraryService()
}
