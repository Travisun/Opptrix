import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveUserDataRoot } from '@opptrix/shared'
import type {
  AttachmentExtractMeta,
  AttachmentLimits,
  ChatAttachmentMeta,
  MediaKind,
  ModelMediaCapabilities,
} from './media-types.js'
import {
  formatBytesShort,
  isLibraryIngestKind,
  mediaKindLabel,
  mimeToMediaKind,
  resolveMediaMime,
} from './media-types.js'
import { extractPdfToMarkdown, type PdfExtractChunk } from './pdf-extract.js'

const META_FILENAME = 'meta.json'
const EXTRACT_MD = 'extract.md'
const EXTRACT_CHUNKS = 'extract-chunks.json'
const DEFAULT_PDF_MAX_BYTES = 20 * 1024 * 1024
const EXTRACT_WAIT_MS = 90_000
const EXTRACT_POLL_MS = 400
const MIN_USEFUL_CHARS = 24

export interface SaveAttachmentInput {
  sessionId: string
  name: string
  mime: string
  data: Buffer
  width?: number
  height?: number
  duration?: number
}

export type AttachmentValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export interface ExtractChunkRecord extends PdfExtractChunk {}

export function parseNonNegativeIntHeader(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** 上传 MIME：优先 X-Attachment-Mime，Content-Type 为 octet-stream 时不当作真实类型 */
export function resolveUploadMime(
  contentType?: string,
  attachmentMime?: string,
  filename?: string,
): string {
  const explicit = typeof attachmentMime === 'string' ? attachmentMime.split(';')[0].trim() : ''
  const ct = typeof contentType === 'string' ? contentType.split(';')[0].trim() : ''
  return resolveMediaMime(explicit || ct || '', filename)
}

function attachmentsRoot(): string {
  return path.join(resolveUserDataRoot(), 'chat-attachments')
}

function sessionDir(sessionId: string): string {
  return path.join(attachmentsRoot(), sanitizeId(sessionId))
}

function attachmentDir(sessionId: string, attachmentId: string): string {
  return path.join(sessionDir(sessionId), sanitizeId(attachmentId))
}

function sanitizeId(id: string): string {
  const trimmed = id.trim()
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('无效的附件标识')
  }
  return trimmed
}

function metaPath(sessionId: string, attachmentId: string): string {
  return path.join(attachmentDir(sessionId, attachmentId), META_FILENAME)
}

function dataPath(sessionId: string, attachmentId: string, name: string): string {
  const ext = path.extname(name) || ''
  return path.join(attachmentDir(sessionId, attachmentId), `data${ext}`)
}

function extractMdPath(sessionId: string, attachmentId: string): string {
  return path.join(attachmentDir(sessionId, attachmentId), EXTRACT_MD)
}

function extractChunksPath(sessionId: string, attachmentId: string): string {
  return path.join(attachmentDir(sessionId, attachmentId), EXTRACT_CHUNKS)
}

function resolveSafeDataPath(sessionId: string, attachmentId: string, meta: ChatAttachmentMeta): string {
  const dir = attachmentDir(sessionId, attachmentId)
  const expected = path.resolve(dataPath(sessionId, attachmentId, meta.name))
  if (!expected.startsWith(path.resolve(dir) + path.sep) && expected !== path.resolve(dir)) {
    throw new Error('附件路径无效')
  }
  return expected
}

function writeMeta(sessionId: string, meta: ChatAttachmentMeta): void {
  fs.writeFileSync(metaPath(sessionId, meta.id), JSON.stringify(meta, null, 0))
}

function patchExtract(sessionId: string, attachmentId: string, extract: AttachmentExtractMeta): ChatAttachmentMeta | null {
  const meta = readAttachmentMeta(sessionId, attachmentId)
  if (!meta) return null
  const next: ChatAttachmentMeta = { ...meta, extract: { ...meta.extract, ...extract } }
  writeMeta(sessionId, next)
  return next
}

/** 对外：文档库解析完成后同步 meta.extract（合并 documentId） */
export function applyAttachmentExtractMeta(
  sessionId: string,
  attachmentId: string,
  extract: AttachmentExtractMeta,
): ChatAttachmentMeta | null {
  return patchExtract(sessionId, attachmentId, extract)
}

export interface LegacyExtractPayload {
  pageCount: number
  charCount: number
  markdown: string
  chunks: Array<{ id: string; page: number; offset: number; text: string }>
}

export type DocumentIngestHook = (
  sessionId: string,
  attachmentId: string,
  meta: ChatAttachmentMeta,
  data: Buffer,
) => void

/** @deprecated 使用 DocumentIngestHook */
export type PdfIngestHook = DocumentIngestHook

let documentIngestHook: DocumentIngestHook | null = null

/** doc-library-bridge 注册；避免 chat-attachments ↔ bridge 循环依赖 */
export function registerDocumentIngestHook(hook: DocumentIngestHook): void {
  documentIngestHook = hook
}

/** @deprecated 使用 registerDocumentIngestHook */
export function registerPdfIngestHook(hook: DocumentIngestHook): void {
  registerDocumentIngestHook(hook)
}

/** 双写 legacy extract.md + extract-chunks.json */
export function writeLegacyExtractArtifacts(
  sessionId: string,
  attachmentId: string,
  result: LegacyExtractPayload,
): void {
  const dir = attachmentDir(sessionId, attachmentId)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(extractMdPath(sessionId, attachmentId), result.markdown, 'utf8')
  fs.writeFileSync(
    extractChunksPath(sessionId, attachmentId),
    JSON.stringify(result.chunks, null, 0),
    'utf8',
  )
}

export function readAttachmentMeta(sessionId: string, attachmentId: string): ChatAttachmentMeta | null {
  try {
    const raw = fs.readFileSync(metaPath(sessionId, attachmentId), 'utf8')
    const parsed = JSON.parse(raw) as ChatAttachmentMeta
    if (typeof parsed.id !== 'string' || typeof parsed.mime !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function resolveAttachmentFilePath(sessionId: string, attachmentId: string): string | null {
  const meta = readAttachmentMeta(sessionId, attachmentId)
  if (!meta) return null
  const filePath = resolveSafeDataPath(sessionId, attachmentId, meta)
  return fs.existsSync(filePath) ? filePath : null
}

/**
 * PDF / 文档 / 图片走本地研报库整理，不要求模型原生支持；
 * 其他媒体仍按 caps.input 校验。
 */
export function validateAttachmentAgainstCapabilities(
  kind: MediaKind,
  size: number,
  caps: ModelMediaCapabilities,
  existingCount: number,
  existingTotalBytes: number,
): AttachmentValidationResult {
  if (kind === 'text') {
    return { ok: false, error: '不支持此文件类型' }
  }

  const libraryPath = isLibraryIngestKind(kind)
  if (!libraryPath) {
    if (!caps.attachment && !caps.input.includes(kind)) {
      return {
        ok: false,
        error: '当前模型不支持此类文件，可换模型或去掉附件',
      }
    }
    if (!caps.input.includes(kind)) {
      return {
        ok: false,
        error: `当前模型不支持${mediaKindLabel(kind)}，可换模型或去掉附件`,
      }
    }
  }

  const maxBytes = caps.limits.maxBytesByKind[kind]
    ?? (libraryPath ? DEFAULT_PDF_MAX_BYTES : undefined)
  if (maxBytes && size > maxBytes) {
    return {
      ok: false,
      error: `${mediaKindLabel(kind)}过大（上限 ${formatBytesShort(maxBytes)}）`,
    }
  }
  const maxCount = Math.max(caps.limits.maxCount || 0, libraryPath ? 5 : 0)
  if (existingCount >= maxCount) {
    return { ok: false, error: `附件数量已达上限（${maxCount} 个）` }
  }
  const maxTotal = Math.max(caps.limits.maxTotalBytes || 0, libraryPath ? 80 * 1024 * 1024 : 0)
  if (existingTotalBytes + size > maxTotal) {
    return {
      ok: false,
      error: `附件总大小超出限制（上限 ${formatBytesShort(maxTotal)}）`,
    }
  }
  return { ok: true }
}

export function saveAttachment(input: SaveAttachmentInput): ChatAttachmentMeta {
  const resolvedMime = resolveMediaMime(input.mime, input.name)
  const kind = mimeToMediaKind(resolvedMime, input.name)
  if (!kind) throw new Error('不支持此文件类型')

  const attachmentId = randomUUID()
  const dir = attachmentDir(input.sessionId, attachmentId)
  fs.mkdirSync(dir, { recursive: true })

  const libraryIngest = isLibraryIngestKind(kind)
  const meta: ChatAttachmentMeta = {
    id: attachmentId,
    kind,
    mime: resolvedMime,
    name: input.name,
    size: input.data.length,
    createdAt: new Date().toISOString(),
    ...(input.width ? { width: input.width } : {}),
    ...(input.height ? { height: input.height } : {}),
    ...(input.duration ? { duration: input.duration } : {}),
    ...(libraryIngest ? { extract: { status: 'pending' as const } } : {}),
  }

  const filePath = dataPath(input.sessionId, attachmentId, input.name)
  fs.writeFileSync(filePath, input.data)
  writeMeta(input.sessionId, meta)

  if (libraryIngest) {
    if (documentIngestHook) {
      documentIngestHook(input.sessionId, attachmentId, meta, input.data)
    } else if (kind === 'pdf') {
      schedulePdfExtract(input.sessionId, attachmentId)
    } else {
      patchExtract(input.sessionId, attachmentId, {
        status: 'failed',
        error: '暂时无法整理该文件，请稍后重试',
      })
    }
  }
  return meta
}

/** 异步抽取：不阻塞上传响应 */
export function schedulePdfExtract(sessionId: string, attachmentId: string): void {
  void runPdfExtract(sessionId, attachmentId).catch(() => {
    patchExtract(sessionId, attachmentId, {
      status: 'failed',
      error: '未能整理该研报，请换可复制文本的电子版后再试',
    })
  })
}

async function waitForExtractMeta(
  sessionId: string,
  attachmentId: string,
  timeoutMs = EXTRACT_WAIT_MS,
): Promise<ChatAttachmentMeta | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const meta = readAttachmentMeta(sessionId, attachmentId)
    const status = meta?.extract?.status
    if (status === 'ready' || status === 'failed') return meta
    await new Promise(r => setTimeout(r, EXTRACT_POLL_MS))
  }
  return readAttachmentMeta(sessionId, attachmentId)
}

export async function runPdfExtract(sessionId: string, attachmentId: string): Promise<ChatAttachmentMeta | null> {
  const meta = readAttachmentMeta(sessionId, attachmentId)
  if (!meta || meta.kind !== 'pdf') return meta

  if (documentIngestHook && !meta.extract?.documentId) {
    const buf = readAttachmentBuffer(sessionId, attachmentId)
    if (buf) documentIngestHook(sessionId, attachmentId, meta, buf)
    return waitForExtractMeta(sessionId, attachmentId)
  }

  patchExtract(sessionId, attachmentId, { status: 'pending' })

  const buf = readAttachmentBuffer(sessionId, attachmentId)
  if (!buf) {
    return patchExtract(sessionId, attachmentId, {
      status: 'failed',
      error: '研报文件不可用，请重新添加',
    })
  }

  try {
    const result = await extractPdfToMarkdown(buf)
    if (result.charCount < MIN_USEFUL_CHARS) {
      return patchExtract(sessionId, attachmentId, {
        status: 'failed',
        error: '未能从该研报提取到可复制文本，请换电子版后再试',
        pageCount: result.pageCount,
        charCount: result.charCount,
      })
    }

    const dir = attachmentDir(sessionId, attachmentId)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(extractMdPath(sessionId, attachmentId), result.markdown, 'utf8')
    fs.writeFileSync(
      extractChunksPath(sessionId, attachmentId),
      JSON.stringify(result.chunks, null, 0),
      'utf8',
    )

    return patchExtract(sessionId, attachmentId, {
      status: 'ready',
      pageCount: result.pageCount,
      charCount: result.charCount,
      readyAt: new Date().toISOString(),
    })
  } catch {
    return patchExtract(sessionId, attachmentId, {
      status: 'failed',
      error: '未能整理该研报，请换可复制文本的电子版后再试',
    })
  }
}

export function readExtractMarkdown(sessionId: string, attachmentId: string): string | null {
  try {
    return fs.readFileSync(extractMdPath(sessionId, attachmentId), 'utf8')
  } catch {
    return null
  }
}

export function readExtractChunks(sessionId: string, attachmentId: string): ExtractChunkRecord[] | null {
  try {
    const raw = fs.readFileSync(extractChunksPath(sessionId, attachmentId), 'utf8')
    const parsed = JSON.parse(raw) as ExtractChunkRecord[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function listSessionAttachmentMetas(sessionId: string): ChatAttachmentMeta[] {
  const dir = sessionDir(sessionId)
  if (!fs.existsSync(dir)) return []
  const out: ChatAttachmentMeta[] = []
  for (const name of fs.readdirSync(dir)) {
    const meta = readAttachmentMeta(sessionId, name)
    if (meta) out.push(meta)
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export type WaitPdfExtractResult =
  | { ok: true; meta: ChatAttachmentMeta }
  | { ok: false; reason: 'pending' | 'failed' | 'missing'; message: string; meta?: ChatAttachmentMeta }

/** 发送前短等研报库整理完成（有上限；PDF / 文档 / 图片 OCR） */
export async function waitForPdfExtractReady(
  sessionId: string,
  attachmentId: string,
  timeoutMs = EXTRACT_WAIT_MS,
): Promise<WaitPdfExtractResult> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const meta = readAttachmentMeta(sessionId, attachmentId)
    if (!meta) return { ok: false, reason: 'missing', message: '附件不存在' }
    if (!isLibraryIngestKind(meta.kind)) return { ok: true, meta }
    const status = meta.extract?.status
    if (status === 'ready') return { ok: true, meta }
    if (status === 'failed') {
      return {
        ok: false,
        reason: 'failed',
        message: meta.extract?.error || '未能整理该文件，请换可读文件后重试',
        meta,
      }
    }
    await new Promise(r => setTimeout(r, EXTRACT_POLL_MS))
  }
  const meta = readAttachmentMeta(sessionId, attachmentId) ?? undefined
  return {
    ok: false,
    reason: 'pending',
    message: '整理尚未完成，请稍后再试或重新发送',
    meta,
  }
}

export function readAttachmentBuffer(sessionId: string, attachmentId: string): Buffer | null {
  const meta = readAttachmentMeta(sessionId, attachmentId)
  if (!meta) return null
  const filePath = resolveSafeDataPath(sessionId, attachmentId, meta)
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

export function deleteAttachment(sessionId: string, attachmentId: string): boolean {
  const dir = attachmentDir(sessionId, attachmentId)
  if (!fs.existsSync(dir)) return false
  fs.rmSync(dir, { recursive: true, force: true })
  return true
}

export function isAttachmentReferenced(
  attachmentId: string,
  turns: Array<{ attachments?: ChatAttachmentMeta[] }> | undefined,
): boolean {
  if (!turns?.length) return false
  return turns.some(t => t.attachments?.some(a => a.id === attachmentId))
}

export function summarizePinnedLimits(limits: AttachmentLimits): string {
  const parts: string[] = []
  for (const kind of ['image', 'pdf', 'document', 'video', 'audio'] as MediaKind[]) {
    const max = limits.maxBytesByKind[kind]
    if (max) parts.push(`${mediaKindLabel(kind)} ${formatBytesShort(max)}`)
  }
  return parts.join(' · ')
}

/** PDF 是否已整理为文本目录路径（无需原生 pdf 多模态） */
export function isPdfTextExtractReady(meta: ChatAttachmentMeta): boolean {
  return meta.kind === 'pdf' && meta.extract?.status === 'ready'
}

/** 研报库入库整理是否已就绪（PDF / 文档 / 图片 OCR） */
export function isLibraryExtractReady(meta: ChatAttachmentMeta): boolean {
  return isLibraryIngestKind(meta.kind) && meta.extract?.status === 'ready'
}
