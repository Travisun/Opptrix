import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveUserDataRoot } from '@opptrix/shared'
import type {
  AttachmentExtractMeta,
  AttachmentLimits,
  CanvasAttachmentMeta,
  ChatAttachmentMeta,
  MediaKind,
  MindmapAttachmentMeta,
  ModelMediaCapabilities,
  WebAttachmentMeta,
} from './media-types.js'
import {
  CANVAS_DATA_FILE,
  CANVAS_EXT,
  CANVAS_MIME,
  formatBytesShort,
  isLibraryIngestKind,
  isTranscriptExtractKind,
  mediaKindLabel,
  mimeToMediaKind,
  MINDMAP_DATA_FILE,
  MINDMAP_EXT,
  MINDMAP_MIME,
  resolveMediaMime,
  WEB_DATA_FILE,
  WEB_EXT,
  WEB_MIME,
} from './media-types.js'
import { extractPdfToMarkdown, type PdfExtractChunk } from './pdf-extract.js'

const META_FILENAME = 'meta.json'
const EXTRACT_MD = 'extract.md'
const EXTRACT_CHUNKS = 'extract-chunks.json'
/** 本地路径（研报入库 / 转写）宽松数量上限；不限制单文件/合计字节 */
const LOCAL_PATH_MAX_COUNT = 50
/** 研报库整理发送门闩上限 */
const LIBRARY_EXTRACT_WAIT_MS = 90_000
/** 音视频转写发送门闩上限（较长） */
const MEDIA_EXTRACT_WAIT_MS = 8 * 60_000
/** @deprecated 使用 LIBRARY_EXTRACT_WAIT_MS */
const EXTRACT_WAIT_MS = LIBRARY_EXTRACT_WAIT_MS
const EXTRACT_POLL_MS = 400
const MIN_USEFUL_CHARS = 24
export const ARTIFACT_SOURCE_MAX_CHARS = 200_000

export interface SaveAttachmentInput {
  sessionId: string
  name: string
  mime: string
  data: Buffer
  width?: number
  height?: number
  duration?: number
  /** 显式 kind 时跳过 MIME 推断（用于 canvas/mindmap/web 等） */
  kind?: MediaKind
  canvas?: CanvasAttachmentMeta
  mindmap?: MindmapAttachmentMeta
  web?: WebAttachmentMeta
}

export interface SaveCanvasAttachmentInput {
  sessionId: string
  name: string
  source: string
  canvas: CanvasAttachmentMeta
}

export interface SaveMindmapAttachmentInput {
  sessionId: string
  name: string
  tree: unknown
  mindmap: MindmapAttachmentMeta
}

export interface UpdateCanvasAttachmentInput {
  sessionId: string
  attachmentId: string
  source: string
  canvas?: CanvasAttachmentMeta
  name?: string
}

export interface UpdateMindmapAttachmentInput {
  sessionId: string
  attachmentId: string
  tree: unknown
  mindmap?: MindmapAttachmentMeta
  name?: string
}

export interface WebExtraFile {
  /** 相对附件目录的路径，如 styles.css / charts/app.js */
  path: string
  content: string
}

export interface SaveWebAttachmentInput {
  sessionId: string
  name: string
  html: string
  files?: WebExtraFile[]
  web?: WebAttachmentMeta
}

export interface UpdateWebAttachmentInput {
  sessionId: string
  attachmentId: string
  html: string
  files?: WebExtraFile[]
  name?: string
  web?: WebAttachmentMeta
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

function dataFileBasename(name: string, kind?: MediaKind): string {
  const lower = name.toLowerCase()
  if (kind === 'canvas' || lower.endsWith(CANVAS_EXT)) return CANVAS_DATA_FILE
  if (kind === 'mindmap' || lower.endsWith(MINDMAP_EXT)) return MINDMAP_DATA_FILE
  if (kind === 'web' || lower.endsWith(WEB_EXT)) return WEB_DATA_FILE
  const ext = path.extname(name) || ''
  return `data${ext}`
}

function dataPath(sessionId: string, attachmentId: string, name: string, kind?: MediaKind): string {
  return path.join(attachmentDir(sessionId, attachmentId), dataFileBasename(name, kind))
}

function extractMdPath(sessionId: string, attachmentId: string): string {
  return path.join(attachmentDir(sessionId, attachmentId), EXTRACT_MD)
}

function extractChunksPath(sessionId: string, attachmentId: string): string {
  return path.join(attachmentDir(sessionId, attachmentId), EXTRACT_CHUNKS)
}

function resolveSafeDataPath(sessionId: string, attachmentId: string, meta: ChatAttachmentMeta): string {
  const dir = attachmentDir(sessionId, attachmentId)
  const expected = path.resolve(dataPath(sessionId, attachmentId, meta.name, meta.kind))
  if (!expected.startsWith(path.resolve(dir) + path.sep) && expected !== path.resolve(dir)) {
    throw new Error('附件路径无效')
  }
  return expected
}

/**
 * 安全解析网页制品目录下的相对路径（防穿越）。
 * `relativePath` 空 / `.` / `/` → index.html
 */
export function resolveSafeWebRelativePath(
  sessionId: string,
  attachmentId: string,
  relativePath?: string,
): string {
  const dir = path.resolve(attachmentDir(sessionId, attachmentId))
  let rel = (relativePath ?? '').trim().replace(/\\/g, '/')
  if (!rel || rel === '.' || rel === '/') rel = WEB_DATA_FILE
  if (rel.startsWith('/')) rel = rel.slice(1)
  if (
    rel.includes('\0')
    || rel.split('/').some(seg => seg === '..' || seg === '')
    || path.isAbsolute(rel)
  ) {
    throw new Error('网页资源路径无效')
  }
  const expected = path.resolve(dir, rel)
  if (!expected.startsWith(dir + path.sep) && expected !== dir) {
    throw new Error('网页资源路径无效')
  }
  // 禁止读写 meta / extract 等内部文件名以外的敏感名；meta.json 仍可拒绝
  const base = path.basename(expected)
  if (base === META_FILENAME || base === EXTRACT_MD || base === EXTRACT_CHUNKS) {
    throw new Error('网页资源路径无效')
  }
  return expected
}

function assertSafeWebExtraPath(relPath: string): string {
  const rel = relPath.trim().replace(/\\/g, '/')
  if (!rel || rel === WEB_DATA_FILE || rel === './' + WEB_DATA_FILE) {
    throw new Error('额外文件路径不能覆盖入口 index.html')
  }
  if (
    rel.startsWith('/')
    || path.isAbsolute(rel)
    || rel.includes('\0')
    || rel.split('/').some(seg => seg === '..' || seg === '')
  ) {
    throw new Error(`额外文件路径无效：${relPath}`)
  }
  const base = path.basename(rel)
  if (base === META_FILENAME || base === EXTRACT_MD || base === EXTRACT_CHUNKS) {
    throw new Error(`额外文件路径无效：${relPath}`)
  }
  return rel
}

function writeWebExtraFiles(
  sessionId: string,
  attachmentId: string,
  files: WebExtraFile[] | undefined,
): string[] {
  if (!files?.length) return []
  const written: string[] = []
  const dir = attachmentDir(sessionId, attachmentId)
  for (const file of files) {
    const rel = assertSafeWebExtraPath(String(file.path ?? ''))
    ensureArtifactSourceLength(String(file.content ?? ''))
    const abs = resolveSafeWebRelativePath(sessionId, attachmentId, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, String(file.content ?? ''), 'utf8')
    written.push(rel)
  }
  void dir
  return written
}

function ensureArtifactSourceLength(source: string): void {
  if (source.length > ARTIFACT_SOURCE_MAX_CHARS) {
    throw new Error(`内容过长（上限 ${ARTIFACT_SOURCE_MAX_CHARS} 字符）`)
  }
}

function ensureDisplayName(raw: string, fallbackExt: string): string {
  const trimmed = raw.trim() || '未命名'
  const base = path.basename(trimmed).replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_').slice(0, 160) || '未命名'
  if (fallbackExt === CANVAS_EXT && !base.toLowerCase().endsWith(CANVAS_EXT)) {
    return `${base.replace(/\.(tsx|ts|jsx|js)$/i, '')}${CANVAS_EXT}`
  }
  if (fallbackExt === MINDMAP_EXT && !base.toLowerCase().endsWith(MINDMAP_EXT)) {
    return `${base.replace(/\.json$/i, '')}${MINDMAP_EXT}`
  }
  if (fallbackExt === WEB_EXT && !base.toLowerCase().endsWith(WEB_EXT)) {
    return `${base.replace(/\.(html|htm)$/i, '')}${WEB_EXT}`
  }
  return base
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

/** 音视频转写 hook（由 server media-transcript-bridge 注册；避免 agent 依赖 local-inference） */
export type MediaTranscriptHook = (
  sessionId: string,
  attachmentId: string,
  meta: ChatAttachmentMeta,
  data: Buffer,
) => void

let mediaTranscriptHook: MediaTranscriptHook | null = null

export function registerMediaTranscriptHook(hook: MediaTranscriptHook): void {
  mediaTranscriptHook = hook
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
 * PDF / 文档 / 图片走本地研报库整理；音视频走后台转写。
 * 二者均不要求模型原生多模态；其他媒体仍按 caps.input 校验。
 * 本地路径不卡单文件/合计字节上限（仅保留数量上限）；≥ LARGE_FILE_WARN_BYTES 由 UI 确认。
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
  const transcriptPath = isTranscriptExtractKind(kind)
  const localExtractPath = libraryPath || transcriptPath
  if (!localExtractPath) {
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

    const maxBytes = caps.limits.maxBytesByKind[kind]
    if (maxBytes && size > maxBytes) {
      return {
        ok: false,
        error: `${mediaKindLabel(kind)}过大（上限 ${formatBytesShort(maxBytes)}）`,
      }
    }
    const maxCount = caps.limits.maxCount || 0
    if (maxCount > 0 && existingCount >= maxCount) {
      return { ok: false, error: `附件数量已达上限（${maxCount} 个）` }
    }
    const maxTotal = caps.limits.maxTotalBytes || 0
    if (maxTotal > 0 && existingTotalBytes + size > maxTotal) {
      return {
        ok: false,
        error: `附件总大小超出限制（上限 ${formatBytesShort(maxTotal)}）`,
      }
    }
    return { ok: true }
  }

  // 本地路径：跳过 per-file / total 字节门禁；保留宽松数量上限
  const maxCount = Math.max(caps.limits.maxCount || 0, LOCAL_PATH_MAX_COUNT)
  if (existingCount >= maxCount) {
    return { ok: false, error: `附件数量已达上限（${maxCount} 个）` }
  }
  return { ok: true }
}

export function saveAttachment(input: SaveAttachmentInput): ChatAttachmentMeta {
  const resolvedMime = resolveMediaMime(input.mime, input.name)
  const kind = input.kind ?? mimeToMediaKind(resolvedMime, input.name)
  if (!kind) throw new Error('不支持此文件类型')

  const attachmentId = randomUUID()
  const dir = attachmentDir(input.sessionId, attachmentId)
  fs.mkdirSync(dir, { recursive: true })

  const libraryIngest = isLibraryIngestKind(kind)
  const transcriptExtract = isTranscriptExtractKind(kind)
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
    ...(input.canvas ? { canvas: input.canvas } : {}),
    ...(input.mindmap ? { mindmap: input.mindmap } : {}),
    ...(input.web ? { web: input.web } : {}),
    ...(libraryIngest
      ? { extract: { status: 'pending' as const } }
      : transcriptExtract
        ? {
            extract: {
              status: 'pending' as const,
              phase: 'converting' as const,
              message: '正在准备转写…',
            },
          }
        : {}),
  }

  const filePath = dataPath(input.sessionId, attachmentId, input.name, kind)
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
  } else if (transcriptExtract) {
    scheduleMediaTranscriptExtract(input.sessionId, attachmentId)
  }
  return meta
}

export function saveCanvasAttachment(input: SaveCanvasAttachmentInput): ChatAttachmentMeta {
  ensureArtifactSourceLength(input.source)
  const name = ensureDisplayName(input.name, CANVAS_EXT)
  return saveAttachment({
    sessionId: input.sessionId,
    name,
    mime: CANVAS_MIME,
    data: Buffer.from(input.source, 'utf8'),
    kind: 'canvas',
    canvas: input.canvas,
  })
}

export function saveMindmapAttachment(input: SaveMindmapAttachmentInput): ChatAttachmentMeta {
  const json = `${JSON.stringify(input.tree, null, 2)}\n`
  ensureArtifactSourceLength(json)
  const name = ensureDisplayName(input.name, MINDMAP_EXT)
  return saveAttachment({
    sessionId: input.sessionId,
    name,
    mime: MINDMAP_MIME,
    data: Buffer.from(json, 'utf8'),
    kind: 'mindmap',
    mindmap: input.mindmap,
  })
}

export function updateCanvasAttachment(input: UpdateCanvasAttachmentInput): ChatAttachmentMeta | null {
  const meta = readAttachmentMeta(input.sessionId, input.attachmentId)
  if (!meta || meta.kind !== 'canvas') return null
  ensureArtifactSourceLength(input.source)
  const next: ChatAttachmentMeta = {
    ...meta,
    name: input.name ? ensureDisplayName(input.name, CANVAS_EXT) : meta.name,
    size: Buffer.byteLength(input.source, 'utf8'),
    mime: CANVAS_MIME,
    canvas: input.canvas ?? meta.canvas,
  }
  const filePath = resolveSafeDataPath(input.sessionId, input.attachmentId, next)
  fs.writeFileSync(filePath, input.source, 'utf8')
  writeMeta(input.sessionId, next)
  return next
}

export function updateMindmapAttachment(input: UpdateMindmapAttachmentInput): ChatAttachmentMeta | null {
  const meta = readAttachmentMeta(input.sessionId, input.attachmentId)
  if (!meta || meta.kind !== 'mindmap') return null
  const json = `${JSON.stringify(input.tree, null, 2)}\n`
  ensureArtifactSourceLength(json)
  const next: ChatAttachmentMeta = {
    ...meta,
    name: input.name ? ensureDisplayName(input.name, MINDMAP_EXT) : meta.name,
    size: Buffer.byteLength(json, 'utf8'),
    mime: MINDMAP_MIME,
    mindmap: input.mindmap ?? meta.mindmap,
  }
  const filePath = resolveSafeDataPath(input.sessionId, input.attachmentId, next)
  fs.writeFileSync(filePath, json, 'utf8')
  writeMeta(input.sessionId, next)
  return next
}

export function saveWebAttachment(input: SaveWebAttachmentInput): ChatAttachmentMeta {
  ensureArtifactSourceLength(input.html)
  const name = ensureDisplayName(input.name, WEB_EXT)
  const attachmentId = randomUUID()
  const dir = attachmentDir(input.sessionId, attachmentId)
  fs.mkdirSync(dir, { recursive: true })

  const indexPath = path.join(dir, WEB_DATA_FILE)
  fs.writeFileSync(indexPath, input.html, 'utf8')
  const extraFiles = writeWebExtraFiles(input.sessionId, attachmentId, input.files)

  const web: WebAttachmentMeta = {
    entry: WEB_DATA_FILE,
    ...(extraFiles.length ? { files: extraFiles } : {}),
    ...input.web,
  }
  if (!web.files?.length && extraFiles.length) web.files = extraFiles

  let totalSize = Buffer.byteLength(input.html, 'utf8')
  for (const rel of web.files ?? []) {
    try {
      totalSize += fs.statSync(path.join(dir, rel)).size
    } catch {
      /* ignore */
    }
  }

  const meta: ChatAttachmentMeta = {
    id: attachmentId,
    kind: 'web',
    mime: WEB_MIME,
    name,
    size: totalSize,
    createdAt: new Date().toISOString(),
    web,
  }
  writeMeta(input.sessionId, meta)
  return meta
}

export function updateWebAttachment(input: UpdateWebAttachmentInput): ChatAttachmentMeta | null {
  const meta = readAttachmentMeta(input.sessionId, input.attachmentId)
  if (!meta || meta.kind !== 'web') return null
  ensureArtifactSourceLength(input.html)
  const dir = attachmentDir(input.sessionId, input.attachmentId)
  const indexPath = resolveSafeWebRelativePath(input.sessionId, input.attachmentId, WEB_DATA_FILE)
  fs.writeFileSync(indexPath, input.html, 'utf8')
  const extraFiles = writeWebExtraFiles(input.sessionId, input.attachmentId, input.files)
  const prevFiles = meta.web?.files ?? []
  const mergedFiles = extraFiles.length
    ? [...new Set([...prevFiles, ...extraFiles])]
    : prevFiles

  let totalSize = Buffer.byteLength(input.html, 'utf8')
  for (const rel of mergedFiles) {
    try {
      totalSize += fs.statSync(path.join(dir, rel)).size
    } catch {
      /* ignore */
    }
  }

  const next: ChatAttachmentMeta = {
    ...meta,
    name: input.name ? ensureDisplayName(input.name, WEB_EXT) : meta.name,
    size: totalSize,
    mime: WEB_MIME,
    web: {
      entry: WEB_DATA_FILE,
      ...(mergedFiles.length ? { files: mergedFiles } : {}),
      ...input.web,
    },
  }
  writeMeta(input.sessionId, next)
  return next
}

export function readWebIndexHtml(sessionId: string, attachmentId: string): string | null {
  const meta = readAttachmentMeta(sessionId, attachmentId)
  if (!meta || meta.kind !== 'web') return null
  try {
    const filePath = resolveSafeWebRelativePath(sessionId, attachmentId, WEB_DATA_FILE)
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

export function resolveWebAttachmentDir(sessionId: string, attachmentId: string): string | null {
  const meta = readAttachmentMeta(sessionId, attachmentId)
  if (!meta || meta.kind !== 'web') return null
  const dir = attachmentDir(sessionId, attachmentId)
  return fs.existsSync(dir) ? dir : null
}

export function readAttachmentText(sessionId: string, attachmentId: string): string | null {
  const buffer = readAttachmentBuffer(sessionId, attachmentId)
  if (!buffer) return null
  return buffer.toString('utf8')
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

/** 异步音视频转写：不阻塞上传响应；实际工作由 mediaTranscriptHook 完成 */
export function scheduleMediaTranscriptExtract(sessionId: string, attachmentId: string): void {
  const meta = readAttachmentMeta(sessionId, attachmentId)
  if (!meta || !isTranscriptExtractKind(meta.kind)) return
  const buf = readAttachmentBuffer(sessionId, attachmentId)
  if (!buf) {
    patchExtract(sessionId, attachmentId, {
      status: 'failed',
      phase: 'failed',
      error: '文件不可用，请重新添加',
    })
    return
  }
  if (mediaTranscriptHook) {
    try {
      mediaTranscriptHook(sessionId, attachmentId, meta, buf)
    } catch {
      patchExtract(sessionId, attachmentId, {
        status: 'failed',
        phase: 'failed',
        error: '暂时无法转写该文件，请稍后重试',
      })
    }
    return
  }
  patchExtract(sessionId, attachmentId, {
    status: 'failed',
    phase: 'failed',
    error: '暂时无法转写该文件，请稍后重试',
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

export type WaitAttachmentExtractResult =
  | { ok: true; meta: ChatAttachmentMeta }
  | { ok: false; reason: 'pending' | 'failed' | 'missing'; message: string; meta?: ChatAttachmentMeta }

/** @deprecated 使用 WaitAttachmentExtractResult */
export type WaitPdfExtractResult = WaitAttachmentExtractResult

export type WaitAttachmentExtractOptions = {
  /** pending 轮询时回调（可用于刷新 thinking 文案） */
  onPending?: (meta: ChatAttachmentMeta) => void
}

function needsExtractGate(kind: MediaKind): boolean {
  return isLibraryIngestKind(kind) || isTranscriptExtractKind(kind)
}

function defaultExtractWaitMs(kind: MediaKind): number {
  return isTranscriptExtractKind(kind) ? MEDIA_EXTRACT_WAIT_MS : LIBRARY_EXTRACT_WAIT_MS
}

function extractPendingTimeoutMessage(kind: MediaKind): string {
  return isTranscriptExtractKind(kind)
    ? '转写尚未完成，请稍后再试或重新发送'
    : '整理尚未完成，请稍后再试或重新发送'
}

function extractFailedMessage(meta: ChatAttachmentMeta): string {
  if (isTranscriptExtractKind(meta.kind)) {
    return meta.extract?.error || '未能完成转写，请换文件后重试'
  }
  return meta.extract?.error || '未能整理该文件，请换可读文件后重试'
}

/** 发送前短等附件整理/转写完成（研报库 + 音视频；有上限） */
export async function waitForAttachmentExtractReady(
  sessionId: string,
  attachmentId: string,
  timeoutMs?: number,
  opts?: WaitAttachmentExtractOptions,
): Promise<WaitAttachmentExtractResult> {
  let lastMessage: string | undefined
  const first = readAttachmentMeta(sessionId, attachmentId)
  if (!first) return { ok: false, reason: 'missing', message: '附件不存在' }
  if (!needsExtractGate(first.kind)) return { ok: true, meta: first }

  const deadline = Date.now() + (timeoutMs ?? defaultExtractWaitMs(first.kind))
  while (Date.now() <= deadline) {
    const meta = readAttachmentMeta(sessionId, attachmentId)
    if (!meta) return { ok: false, reason: 'missing', message: '附件不存在' }
    if (!needsExtractGate(meta.kind)) return { ok: true, meta }
    const status = meta.extract?.status
    if (status === 'ready') return { ok: true, meta }
    if (status === 'failed') {
      return {
        ok: false,
        reason: 'failed',
        message: extractFailedMessage(meta),
        meta,
      }
    }
    const tickMsg = meta.extract?.message
    if (opts?.onPending && tickMsg !== lastMessage) {
      lastMessage = tickMsg
      opts.onPending(meta)
    }
    await new Promise(r => setTimeout(r, EXTRACT_POLL_MS))
  }
  const meta = readAttachmentMeta(sessionId, attachmentId) ?? undefined
  return {
    ok: false,
    reason: 'pending',
    message: extractPendingTimeoutMessage(meta?.kind ?? first.kind),
    meta,
  }
}

/** @deprecated 使用 waitForAttachmentExtractReady */
export async function waitForPdfExtractReady(
  sessionId: string,
  attachmentId: string,
  timeoutMs?: number,
  opts?: WaitAttachmentExtractOptions,
): Promise<WaitPdfExtractResult> {
  return waitForAttachmentExtractReady(sessionId, attachmentId, timeoutMs, opts)
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

/**
 * 删除某会话下全部聊天附件目录（`chat-attachments/<sessionId>/`）。
 * 幂等：目录不存在返回 false；失败抛错，由调用方 warn（不阻断删会话）。
 */
export function deleteSessionAttachments(sessionId: string): boolean {
  const dir = sessionDir(sessionId)
  if (!fs.existsSync(dir)) return false
  fs.rmSync(dir, { recursive: true, force: true })
  return true
}

/**
 * 启动时清理孤儿附件会话目录：根下存在、但不在 knownSessionIds 中的子目录。
 * best-effort：单目录失败只 warn，不抛；返回成功删除的目录数。
 */
export function pruneOrphanChatAttachments(knownSessionIds: string[]): number {
  const known = new Set(
    knownSessionIds
      .map(id => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean),
  )
  const root = attachmentsRoot()
  if (!fs.existsSync(root)) return 0

  let removed = 0
  let entries: string[]
  try {
    entries = fs.readdirSync(root)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[chat-attachments] 扫描附件根目录失败: ${msg}`)
    return 0
  }

  for (const name of entries) {
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) continue
    if (known.has(name)) continue
    const full = path.join(root, name)
    try {
      const st = fs.lstatSync(full)
      if (!st.isDirectory()) continue
      fs.rmSync(full, { recursive: true, force: true })
      removed += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[chat-attachments] 清理孤儿附件目录失败 (${name}): ${msg}`)
    }
  }
  return removed
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

/** 音视频转写是否已就绪 */
export function isTranscriptExtractReady(meta: ChatAttachmentMeta): boolean {
  return isTranscriptExtractKind(meta.kind) && meta.extract?.status === 'ready'
}
