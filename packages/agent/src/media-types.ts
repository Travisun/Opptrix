/** 媒体种类；text 不占附件配额；document = 文本/Office 研报入库；canvas/mindmap = Agent 制品 */
export type MediaKind =
  | 'text'
  | 'image'
  | 'pdf'
  | 'document'
  | 'video'
  | 'audio'
  | 'canvas'
  | 'mindmap'

/** Agent 画布 MIME / 固定存盘名 */
export const CANVAS_MIME = 'application/vnd.opptrix.canvas+tsx'
export const CANVAS_DATA_FILE = 'data.canvas.tsx'
export const CANVAS_EXT = '.canvas.tsx'

/** Agent 脑图 MIME / 固定存盘名 */
export const MINDMAP_MIME = 'application/vnd.opptrix.mindmap+json'
export const MINDMAP_DATA_FILE = 'data.mindmap.json'
export const MINDMAP_EXT = '.mindmap.json'

/** Optional print dimensions; ignored for fluid mode. Legacy preset may appear on old attachments. */
export type CanvasPageSpec =
  | { preset: string }
  | { widthMm: number; heightMm: number }
  | { widthPx: number; heightPx: number }

export interface CanvasAttachmentMeta {
  /** Default `fluid` (responsive Surface). `print` is optional / legacy. */
  mode: 'fluid' | 'print'
  /** Optional; ignored for fluid. May be present on legacy attachments. */
  page?: CanvasPageSpec
  pageCount?: number
}

export interface MindmapAttachmentMeta {
  rootId: string
}

/** 附件文本整理状态（含 OCR） */
export type AttachmentExtractStatus = 'pending' | 'ready' | 'failed'

/** 整理子阶段（可选；旧客户端可忽略，仅看 status） */
export type AttachmentExtractPhase =
  | 'converting'
  | 'extracting'
  | 'ocr'
  | 'ready'
  | 'failed'

export interface AttachmentExtractMeta {
  status: AttachmentExtractStatus
  /** 文档库 document_id；与库内 parse 状态镜像 */
  documentId?: string
  error?: string
  pageCount?: number
  charCount?: number
  readyAt?: string
  /** 进行中阶段；pending 时 UI 可显示更细进度 */
  phase?: AttachmentExtractPhase
  /** 内嵌图 OCR 已完成张数（去重后） */
  ocrDone?: number
  /** 内嵌图 OCR 总张数（去重后） */
  ocrTotal?: number
  /** 用户可见短句（可选） */
  message?: string
}

export interface ChatAttachmentMeta {
  id: string
  kind: MediaKind
  mime: string
  name: string
  size: number
  createdAt: string
  width?: number
  height?: number
  duration?: number
  /** 异步文本整理（PDF / 文档 / 图片 OCR / 音视频转写） */
  extract?: AttachmentExtractMeta
  /** 画布制品元数据（kind=canvas） */
  canvas?: CanvasAttachmentMeta
  /** 脑图制品元数据（kind=mindmap） */
  mindmap?: MindmapAttachmentMeta
}

export interface AttachmentLimits {
  maxBytesByKind: Partial<Record<MediaKind, number>>
  maxCount: number
  maxTotalBytes: number
}

export interface ModelMediaCapabilities {
  attachment: boolean
  input: MediaKind[]
  output: MediaKind[]
  limits: AttachmentLimits
}

const IMAGE_PREFIX = 'image/'
const VIDEO_PREFIX = 'video/'
const AUDIO_PREFIX = 'audio/'

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  [CANVAS_EXT]: CANVAS_MIME,
  [MINDMAP_EXT]: MINDMAP_MIME,
}

const DOCUMENT_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
])

const DOCUMENT_EXT = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.docx', '.doc', '.pptx', '.ppt',
])

export function inferMimeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith(CANVAS_EXT)) return CANVAS_MIME
  if (lower.endsWith(MINDMAP_EXT)) return MINDMAP_MIME
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_MIME[filename.slice(dot).toLowerCase()] ?? null
}

function kindFromNormalizedMime(normalized: string, filename?: string): MediaKind | null {
  if (!normalized) return null
  if (normalized === CANVAS_MIME) return 'canvas'
  if (normalized === MINDMAP_MIME) return 'mindmap'
  if (normalized.startsWith(IMAGE_PREFIX)) return 'image'
  if (normalized === 'application/pdf') return 'pdf'
  if (normalized.startsWith(VIDEO_PREFIX)) return 'video'
  if (normalized.startsWith(AUDIO_PREFIX)) return 'audio'
  if (DOCUMENT_MIME.has(normalized)) return 'document'
  if (filename) {
    const lower = filename.toLowerCase()
    if (lower.endsWith(CANVAS_EXT)) return 'canvas'
    if (lower.endsWith(MINDMAP_EXT)) return 'mindmap'
    const dot = filename.lastIndexOf('.')
    if (dot >= 0 && DOCUMENT_EXT.has(filename.slice(dot).toLowerCase())) return 'document'
  }
  return null
}

/** 解析有效 MIME：空 type / octet-stream 时按扩展名推断 */
export function resolveMediaMime(mime: string, filename?: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized && normalized !== 'application/octet-stream') return normalized
  if (filename) {
    const inferred = inferMimeFromFilename(filename)
    if (inferred) return inferred
  }
  return normalized || 'application/octet-stream'
}

export function mimeToMediaKind(mime: string, filename?: string): MediaKind | null {
  const resolved = resolveMediaMime(mime, filename)
  return kindFromNormalizedMime(resolved, filename)
}

/** 本地研报库入库路径（不依赖模型多模态） */
export function isLibraryIngestKind(kind: MediaKind): boolean {
  return kind === 'pdf' || kind === 'document' || kind === 'image'
}

/** 音视频后台转写路径（不并入研报库入库） */
export function isTranscriptExtractKind(kind: MediaKind): boolean {
  return kind === 'audio' || kind === 'video'
}

export function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function mediaKindLabel(kind: MediaKind): string {
  switch (kind) {
    case 'image': return '图片'
    case 'pdf': return 'PDF'
    case 'document': return '文档'
    case 'video': return '视频'
    case 'audio': return '音频'
    case 'canvas': return '画布'
    case 'mindmap': return '脑图'
    default: return '文件'
  }
}
