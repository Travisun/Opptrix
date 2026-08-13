/**
 * doc-library blobs / markdown 孤儿清扫：磁盘文件无 documents 引用则 unlink。
 * best-effort、限速；跳过仍在冷却期内的新文件，避免与 writeBlob / markParseReady 竞态。
 */
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { docLibraryRoot } from './paths.js'

const BLOBS_DIR = 'blobs'
const MARKDOWN_DIR = 'markdown'

/** 默认跳过 mtime 仍在 1h 内的文件（热路径写入冷却） */
export const DEFAULT_ORPHAN_BLOB_MIN_AGE_MS = 60 * 60 * 1000

/** 单轮最多 unlink 数，避免 boot / retention 卡死 */
export const DEFAULT_ORPHAN_BLOB_MAX_REMOVE = 200

const SHA256_HEX = /^[a-f0-9]{64}$/i
/** markdown 文件名 = documentId.md；documentId 为 UUID */
const DOC_MD = /^[a-zA-Z0-9_-]+\.md$/

export type PruneOrphanBlobsOptions = {
  blobsDir?: string
  markdownDir?: string
  /** 文件 mtime 距今小于此值则跳过（防竞态）；0 = 不跳过 */
  minAgeMs?: number
  maxRemove?: number
  nowMs?: number
}

export type PruneOrphanBlobsResult = {
  removedBlobs: number
  removedMarkdown: number
  skippedFresh: number
  scannedBlobs: number
  scannedMarkdown: number
}

function unlinkQuiet(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

function listReferencedBlobNames(db: Database.Database): Set<string> {
  const rows = db.prepare(`
    SELECT content_sha256 AS sha FROM documents
  `).all() as Array<{ sha: string }>
  const out = new Set<string>()
  for (const row of rows) {
    const sha = String(row.sha ?? '').trim().toLowerCase()
    if (SHA256_HEX.test(sha)) out.add(sha)
  }
  return out
}

function listReferencedMarkdownNames(db: Database.Database): Set<string> {
  const out = new Set<string>()
  const byId = db.prepare(`SELECT id FROM documents`).all() as Array<{ id: string }>
  for (const row of byId) {
    const id = String(row.id ?? '').trim()
    if (id) out.add(`${id}.md`)
  }
  const byMd = db.prepare(`
    SELECT md_path FROM parse_artifacts WHERE md_path IS NOT NULL AND md_path != ''
  `).all() as Array<{ md_path: string }>
  for (const row of byMd) {
    const base = path.basename(String(row.md_path ?? ''))
    if (base && DOC_MD.test(base)) out.add(base)
  }
  return out
}

function isOldEnough(mtimeMs: number, now: number, minAgeMs: number): boolean {
  if (minAgeMs <= 0) return true
  return now - mtimeMs > minAgeMs
}

/**
 * 扫 `doc-library/blobs` 与 `markdown`：仅删明确无 documents / parse_artifacts 引用的文件。
 * 不抛错；调用方决定日志。
 */
export function pruneOrphanBlobsAndMarkdown(
  db: Database.Database,
  opts: PruneOrphanBlobsOptions = {},
): PruneOrphanBlobsResult {
  const root = docLibraryRoot()
  const blobsDir = opts.blobsDir ?? path.join(root, BLOBS_DIR)
  const markdownDir = opts.markdownDir ?? path.join(root, MARKDOWN_DIR)
  const minAgeMs = opts.minAgeMs ?? DEFAULT_ORPHAN_BLOB_MIN_AGE_MS
  const maxRemove = Math.max(1, opts.maxRemove ?? DEFAULT_ORPHAN_BLOB_MAX_REMOVE)
  const now = opts.nowMs ?? Date.now()

  let removedBlobs = 0
  let removedMarkdown = 0
  let skippedFresh = 0
  let scannedBlobs = 0
  let scannedMarkdown = 0
  let budget = maxRemove

  const referencedBlobs = listReferencedBlobNames(db)
  const referencedMd = listReferencedMarkdownNames(db)

  if (fs.existsSync(blobsDir)) {
    let names: string[] = []
    try {
      names = fs.readdirSync(blobsDir)
    } catch {
      names = []
    }
    for (const name of names) {
      if (budget <= 0) break
      if (!SHA256_HEX.test(name)) continue
      scannedBlobs += 1
      if (referencedBlobs.has(name.toLowerCase())) continue
      const full = path.join(blobsDir, name)
      try {
        const st = fs.lstatSync(full)
        if (!st.isFile()) continue
        if (!isOldEnough(st.mtimeMs, now, minAgeMs)) {
          skippedFresh += 1
          continue
        }
        if (unlinkQuiet(full)) {
          removedBlobs += 1
          budget -= 1
        }
      } catch {
        /* raced / unreadable */
      }
    }
  }

  if (fs.existsSync(markdownDir) && budget > 0) {
    let names: string[] = []
    try {
      names = fs.readdirSync(markdownDir)
    } catch {
      names = []
    }
    for (const name of names) {
      if (budget <= 0) break
      if (!DOC_MD.test(name)) continue
      scannedMarkdown += 1
      if (referencedMd.has(name)) continue
      const full = path.join(markdownDir, name)
      try {
        const st = fs.lstatSync(full)
        if (!st.isFile()) continue
        if (!isOldEnough(st.mtimeMs, now, minAgeMs)) {
          skippedFresh += 1
          continue
        }
        if (unlinkQuiet(full)) {
          removedMarkdown += 1
          budget -= 1
        }
      } catch {
        /* raced / unreadable */
      }
    }
  }

  return {
    removedBlobs,
    removedMarkdown,
    skippedFresh,
    scannedBlobs,
    scannedMarkdown,
  }
}
