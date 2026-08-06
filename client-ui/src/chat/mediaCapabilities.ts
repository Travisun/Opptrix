import type { MediaKind, ChatAttachmentMeta, ModelMediaCapabilities } from '../types/chat'

const KIND_LABEL: Record<Exclude<MediaKind, 'text'>, string> = {
  image: '图片',
  pdf: 'PDF',
  document: '文档',
  video: '视频',
  audio: '音频',
  canvas: '画布',
  mindmap: '脑图',
}

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

export function inferMimeFromFilename(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_MIME[filename.slice(dot).toLowerCase()] ?? null
}

export function resolveFileMime(file: Pick<File, 'type' | 'name'>): string {
  const normalized = file.type.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized && normalized !== 'application/octet-stream') return normalized
  return inferMimeFromFilename(file.name) ?? (normalized || 'application/octet-stream')
}

export function resolveActiveModelMedia(
  models: Array<{ ref: string; media?: ModelMediaCapabilities; attachment?: boolean; inputModalities?: MediaKind[]; attachmentLimits?: ModelMediaCapabilities['limits'] }>,
  modelRef?: string,
): ModelMediaCapabilities | null {
  const ref = modelRef?.trim()
  const hit = ref ? models.find(m => m.ref === ref) : models[0]
  if (!hit) return null
  if (hit.media) return hit.media
  if (hit.inputModalities || hit.attachmentLimits) {
    return {
      attachment: hit.attachment ?? false,
      input: hit.inputModalities ?? ['text'],
      output: ['text'],
      limits: hit.attachmentLimits ?? { maxBytesByKind: {}, maxCount: 0, maxTotalBytes: 0 },
    }
  }
  return null
}

export function modelAllowsAttachments(_media: ModelMediaCapabilities | null): boolean {
  // 研报/文档/图片入库路径始终可用（与 buildAcceptForMedia 一致）；media 仅影响额外类型与限额
  return true
}

export function buildAcceptForMedia(media: ModelMediaCapabilities | null): string {
  const parts: string[] = [
    'application/pdf',
    '.txt',
    '.md',
    '.markdown',
    '.docx',
    '.doc',
    '.pptx',
    '.ppt',
    'image/*',
  ]
  if (media?.input.includes('video')) parts.push('video/*')
  if (media?.input.includes('audio')) parts.push('audio/*')
  return [...new Set(parts)].join(',')
}

export function modelMediaHint(media: ModelMediaCapabilities | null): string | null {
  if (!media) return '支持研报、文档与图片'
  const kinds = media.input.filter(k => k !== 'text')
  const labels = new Set<string>(['研报', '文档', '图片'])
  for (const k of kinds) {
    if (k === 'pdf' || k === 'document' || k === 'image') continue
    labels.add(KIND_LABEL[k as Exclude<MediaKind, 'text'>] ?? k)
  }
  return `支持${[...labels].join('、')}`
}

export function isLibraryIngestKind(kind: MediaKind): boolean {
  return kind === 'pdf' || kind === 'document' || kind === 'image'
}

export function isKindSupported(media: ModelMediaCapabilities | null, kind: MediaKind): boolean {
  if (kind === 'text') return true
  if (isLibraryIngestKind(kind)) return true
  if (!media) return false
  return media.input.includes(kind)
}

export function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DEFAULT_DOC_MAX = 20 * 1024 * 1024

export function mimeToKind(mime: string, filename?: string): MediaKind | null {
  const m = resolveFileMime({ type: mime, name: filename ?? '' }).toLowerCase().split(';')[0]?.trim() ?? ''
  if (!m || m === 'application/octet-stream') return null
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'pdf'
  if (DOCUMENT_MIME.has(m)) return 'document'
  if (filename) {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    if (['.txt', '.md', '.markdown', '.csv', '.json', '.docx', '.doc', '.pptx', '.ppt'].includes(ext)) {
      return 'document'
    }
  }
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  return null
}

/** 旧版 Office：`.doc` / `.ppt`（勿误伤 `.docx` / `.pptx`） */
const LEGACY_OFFICE_MIME = new Set([
  'application/msword',
  'application/vnd.ms-powerpoint',
])

export function isLegacyOfficeAttachment(file: Pick<File, 'type' | 'name'>): boolean {
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot) : ''
  if (ext === '.doc' || ext === '.ppt') return true
  if (ext === '.docx' || ext === '.pptx') return false
  const mime = resolveFileMime(file).toLowerCase().split(';')[0]?.trim() ?? ''
  return LEGACY_OFFICE_MIME.has(mime)
}

export function validateFileForModel(
  file: File,
  media: ModelMediaCapabilities | null,
  pinnedCount: number,
  pinnedTotal: number,
): string | null {
  const kind = mimeToKind(resolveFileMime(file), file.name)
  if (!kind) return '不支持此文件类型'
  if (!isKindSupported(media, kind)) {
    return '当前模型不支持此类文件，可换模型或去掉附件'
  }
  const maxBytes = media?.limits.maxBytesByKind[kind]
    ?? (isLibraryIngestKind(kind) ? DEFAULT_DOC_MAX : undefined)
  if (maxBytes && file.size > maxBytes) {
    return `文件过大（上限 ${formatBytesShort(maxBytes)}）`
  }
  const maxCount = Math.max(media?.limits.maxCount ?? 0, isLibraryIngestKind(kind) ? 5 : 0)
  if (media && pinnedCount >= maxCount) {
    return `附件数量已达上限（${maxCount} 个）`
  }
  const maxTotal = Math.max(media?.limits.maxTotalBytes ?? 0, isLibraryIngestKind(kind) ? 80 * 1024 * 1024 : 0)
  if (media && pinnedTotal + file.size > maxTotal) {
    return `附件总大小超出限制（上限 ${formatBytesShort(maxTotal)}）`
  }
  return null
}

/** 按模型能力拆分 pin：media 未加载时不移除任何项 */
export function partitionPinsForModel(
  pinned: ChatAttachmentMeta[],
  media: ModelMediaCapabilities | null,
): { kept: ChatAttachmentMeta[]; removedIds: string[] } {
  if (media == null) return { kept: pinned, removedIds: [] }
  const kept: ChatAttachmentMeta[] = []
  const removedIds: string[] = []
  let total = 0
  for (const item of pinned) {
    const fake = new File([], item.name, { type: item.mime })
    Object.defineProperty(fake, 'size', { value: item.size })
    const err = validateFileForModel(fake, media, kept.length, total)
    if (err) {
      removedIds.push(item.id)
      continue
    }
    kept.push(item)
    total += item.size
  }
  return { kept, removedIds }
}
