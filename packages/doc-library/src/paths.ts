import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { resolveUserDataRoot } from '@opptrix/shared'
import { migrateDocLibrarySchema } from './schema-migrate.js'

const DB_FILE = 'doc-library.db'
const BLOBS_DIR = 'blobs'
const MARKDOWN_DIR = 'markdown'

/** 与 Architect 契约一致：e5-small / dim=384 */
export const EMBEDDING_MODEL_ID = 'multilingual-e5-small'
export const EMBEDDING_DIM = 384

export function docLibraryRoot(): string {
  return path.join(resolveUserDataRoot(), 'doc-library')
}

export function docLibraryDbPath(): string {
  return path.join(docLibraryRoot(), DB_FILE)
}

export function blobPathForSha(sha256: string): string {
  return path.join(docLibraryRoot(), BLOBS_DIR, sha256)
}

export function markdownPathForDocument(documentId: string): string {
  return path.join(docLibraryRoot(), MARKDOWN_DIR, `${documentId}.md`)
}

/** ~/.opptrix/models/multilingual-e5-small/ */
export function embeddingModelsRoot(): string {
  return path.join(resolveUserDataRoot(), 'models')
}

export function embeddingModelDir(): string {
  return path.join(embeddingModelsRoot(), EMBEDDING_MODEL_ID)
}

/** ~/.opptrix/lancedb/doc_chunks/ */
export function lanceDbDir(): string {
  return path.join(resolveUserDataRoot(), 'lancedb', 'doc_chunks')
}

/** ~/.opptrix/engines/ */
export function enginesRoot(): string {
  return path.join(resolveUserDataRoot(), 'engines')
}

/** ~/.opptrix/engines/pdfplumber-worker/ */
export function pdfplumberWorkerDir(): string {
  return path.join(enginesRoot(), 'pdfplumber-worker')
}

/** ~/.opptrix/engines/unlimited-ocr/ */
export function unlimitedOcrDir(): string {
  return path.join(enginesRoot(), 'unlimited-ocr')
}

export function sha256Buffer(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function newDocumentId(): string {
  return randomUUID()
}

export function ensureDocLibraryDirs(): void {
  fs.mkdirSync(path.join(docLibraryRoot(), BLOBS_DIR), { recursive: true })
  fs.mkdirSync(path.join(docLibraryRoot(), MARKDOWN_DIR), { recursive: true })
}

export function openDocLibraryDb(dbPath = docLibraryDbPath()): Database.Database {
  ensureDocLibraryDirs()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrateDocLibrarySchema(db)
  return db
}
