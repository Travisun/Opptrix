/** 媒体种类；text 不占附件配额 */
export type MediaKind = 'text' | 'image' | 'pdf' | 'video' | 'audio'

/** PDF 文本整理状态（扫描件 OCR 本阶段不做） */
export type AttachmentExtractStatus = 'pending' | 'ready' | 'failed'

export interface AttachmentExtractMeta {
  status: AttachmentExtractStatus
  /** 文档库 document_id；与库内 parse 状态镜像 */
  documentId?: string
  error?: string
  pageCount?: number
  charCount?: number
  readyAt?: string
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
  /** PDF 异步文本整理；非 PDF 通常无此字段 */
  extract?: AttachmentExtractMeta
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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
}

export function inferMimeFromFilename(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_MIME[filename.slice(dot).toLowerCase()] ?? null
}

function kindFromNormalizedMime(normalized: string): MediaKind | null {
  if (!normalized) return null
  if (normalized.startsWith(IMAGE_PREFIX)) return 'image'
  if (normalized === 'application/pdf') return 'pdf'
  if (normalized.startsWith(VIDEO_PREFIX)) return 'video'
  if (normalized.startsWith(AUDIO_PREFIX)) return 'audio'
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
  return kindFromNormalizedMime(resolveMediaMime(mime, filename))
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
    case 'video': return '视频'
    case 'audio': return '音频'
    default: return '文件'
  }
}
