import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveUserDataRoot } from '@opptrix/shared'
import type { AttachmentLimits, ChatAttachmentMeta, MediaKind, ModelMediaCapabilities } from './media-types.js'
import {
  formatBytesShort,
  mediaKindLabel,
  mimeToMediaKind,
  resolveMediaMime,
} from './media-types.js'

const META_FILENAME = 'meta.json'

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

function resolveSafeDataPath(sessionId: string, attachmentId: string, meta: ChatAttachmentMeta): string {
  const dir = attachmentDir(sessionId, attachmentId)
  const expected = path.resolve(dataPath(sessionId, attachmentId, meta.name))
  if (!expected.startsWith(path.resolve(dir) + path.sep) && expected !== path.resolve(dir)) {
    throw new Error('附件路径无效')
  }
  return expected
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
  if (existingCount >= caps.limits.maxCount) {
    return { ok: false, error: `附件数量已达上限（${caps.limits.maxCount} 个）` }
  }
  if (existingTotalBytes + size > caps.limits.maxTotalBytes) {
    return {
      ok: false,
      error: `附件总大小超出限制（上限 ${formatBytesShort(caps.limits.maxTotalBytes)}）`,
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
  }

  const filePath = dataPath(input.sessionId, attachmentId, input.name)
  fs.writeFileSync(filePath, input.data)
  fs.writeFileSync(metaPath(input.sessionId, attachmentId), JSON.stringify(meta, null, 0))
  return meta
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
  for (const kind of ['image', 'pdf', 'video', 'audio'] as MediaKind[]) {
    const max = limits.maxBytesByKind[kind]
    if (max) parts.push(`${mediaKindLabel(kind)} ${formatBytesShort(max)}`)
  }
  return parts.join(' · ')
}
