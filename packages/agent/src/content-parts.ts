import type { ChatAttachmentMeta, MediaKind } from './media-types.js'
import { mimeToMediaKind } from './media-types.js'
import { readAttachmentBuffer, saveAttachment } from './chat-attachments.js'
import type { ContentPart, ChatMessage } from './llm/provider.js'

const DATA_URL_INLINE_MAX = 8 * 1024 * 1024

export interface ParsedAssistantContent {
  text: string
  attachments: ChatAttachmentMeta[]
}

function parseDataUrl(url: string): { mime: string; data: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(url)
  if (!match) return null
  try {
    return { mime: match[1], data: Buffer.from(match[2], 'base64') }
  } catch {
    return null
  }
}

function guessNameFromMime(mime: string): string {
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'bin'
  return `model-output-${Date.now()}.${ext}`
}

export function attachmentToContentPart(
  sessionId: string,
  meta: ChatAttachmentMeta,
  apiBaseUrl: string,
): ContentPart {
  const buf = readAttachmentBuffer(sessionId, meta.id)
  if (!buf) {
    return { type: 'text', text: `[附件 ${meta.name} 不可用]` }
  }

  if (meta.kind === 'image') {
    const b64 = buf.toString('base64')
    const url = `data:${meta.mime};base64,${b64}`
    return { type: 'image_url', image_url: { url, detail: 'auto' } }
  }

  if (meta.kind === 'pdf') {
    return {
      type: 'file',
      file: { filename: meta.name, file_data: buf.toString('base64') },
    }
  }

  if (meta.kind === 'video' || meta.kind === 'audio') {
    if (buf.length <= DATA_URL_INLINE_MAX) {
      const b64 = buf.toString('base64')
      if (meta.kind === 'audio') {
        const fmt = meta.mime.split('/')[1]?.split(';')[0] ?? 'wav'
        return { type: 'input_audio', input_audio: { data: b64, format: fmt } }
      }
      const url = `data:${meta.mime};base64,${b64}`
      return { type: 'image_url', image_url: { url } }
    }
    const url = `${apiBaseUrl.replace(/\/$/, '')}/sessions/${sessionId}/attachments/${meta.id}`
    return { type: 'file', file: { filename: meta.name, file_data: url } }
  }

  return { type: 'text', text: `[不支持的附件类型: ${meta.name}]` }
}

export function buildUserContentParts(
  text: string,
  sessionId: string,
  attachments: ChatAttachmentMeta[],
  apiBaseUrl: string,
): ContentPart[] {
  const parts: ContentPart[] = []
  if (text.trim()) parts.push({ type: 'text', text: text.trim() })
  for (const meta of attachments) {
    parts.push(attachmentToContentPart(sessionId, meta, apiBaseUrl))
  }
  return parts.length ? parts : [{ type: 'text', text: '' }]
}

export function chatMessageContentToText(content: ChatMessage['content']): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  return content
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('\n')
    .trim()
}

export function persistOutputMediaParts(
  sessionId: string,
  parts: ContentPart[],
): { text: string; attachments: ChatAttachmentMeta[] } {
  const textParts: string[] = []
  const attachments: ChatAttachmentMeta[] = []

  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text.trim()) textParts.push(part.text)
      continue
    }
    if (part.type === 'image_url') {
      const url = part.image_url.url
      const parsed = parseDataUrl(url)
      if (parsed && mimeToMediaKind(parsed.mime) === 'image') {
        attachments.push(saveAttachment({
          sessionId,
          name: guessNameFromMime(parsed.mime),
          mime: parsed.mime,
          data: parsed.data,
        }))
        continue
      }
      if (url.startsWith('http://') || url.startsWith('https://')) {
        textParts.push(`![模型输出](${url})`)
      }
      continue
    }
    if (part.type === 'file') {
      const parsed = parseDataUrl(part.file.file_data)
      if (parsed) {
        const kind = mimeToMediaKind(parsed.mime)
        if (kind) {
          attachments.push(saveAttachment({
            sessionId,
            name: part.file.filename || guessNameFromMime(parsed.mime),
            mime: parsed.mime,
            data: parsed.data,
          }))
          continue
        }
      }
    }
    if (part.type === 'input_audio') {
      const mime = `audio/${part.input_audio.format}`
      attachments.push(saveAttachment({
        sessionId,
        name: guessNameFromMime(mime),
        mime,
        data: Buffer.from(part.input_audio.data, 'base64'),
      }))
    }
  }

  return { text: textParts.join('\n').trim(), attachments }
}

export function parseAssistantResponseContent(
  sessionId: string,
  raw: unknown,
): ParsedAssistantContent {
  if (raw == null) return { text: '', attachments: [] }
  if (typeof raw === 'string') return { text: raw.trim(), attachments: [] }
  if (!Array.isArray(raw)) return { text: String(raw), attachments: [] }

  const parts: ContentPart[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const type = rec.type
    if (type === 'text' && typeof rec.text === 'string') {
      parts.push({ type: 'text', text: rec.text })
    } else if (type === 'image_url' && rec.image_url && typeof rec.image_url === 'object') {
      const iu = rec.image_url as Record<string, unknown>
      if (typeof iu.url === 'string') {
        parts.push({
          type: 'image_url',
          image_url: {
            url: iu.url,
            ...(typeof iu.detail === 'string'
              ? { detail: iu.detail as 'auto' | 'low' | 'high' }
              : {}),
          },
        })
      }
    } else if (type === 'file' && rec.file && typeof rec.file === 'object') {
      const f = rec.file as Record<string, unknown>
      if (typeof f.filename === 'string' && typeof f.file_data === 'string') {
        parts.push({ type: 'file', file: { filename: f.filename, file_data: f.file_data } })
      }
    } else if (type === 'input_audio' && rec.input_audio && typeof rec.input_audio === 'object') {
      const ia = rec.input_audio as Record<string, unknown>
      if (typeof ia.data === 'string' && typeof ia.format === 'string') {
        parts.push({ type: 'input_audio', input_audio: { data: ia.data, format: ia.format } })
      }
    }
  }

  return persistOutputMediaParts(sessionId, parts)
}
