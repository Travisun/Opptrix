import type { ChatAttachmentMeta, ModelMediaCapabilities } from './media-types.js'
import { mimeToMediaKind } from './media-types.js'
import {
  isLibraryExtractReady,
  isTranscriptExtractReady,
  readAttachmentBuffer,
  readExtractMarkdown,
  saveAttachment,
} from './chat-attachments.js'
import { formatDocumentCatalogLine } from './pdf-extract.js'
import type { ContentPart, ChatMessage } from './llm/provider.js'

/** 模型是否接受原生 image_url 多模态 part */
export function modelAcceptsImageInput(
  caps?: Pick<ModelMediaCapabilities, 'input'> | null,
): boolean {
  return Boolean(caps?.input.includes('image'))
}

function modelAcceptsFileInput(
  caps?: Pick<ModelMediaCapabilities, 'input'> | null,
): boolean {
  if (!caps) return false
  return caps.input.includes('pdf') || caps.input.includes('document')
}

function modelAcceptsAudioInput(
  caps?: Pick<ModelMediaCapabilities, 'input'> | null,
): boolean {
  return Boolean(caps?.input.includes('audio'))
}

/**
 * 出站前按模型 modalities 剥离不支持的 content parts，避免 text-only schema 炸。
 * image_url / file / input_audio：不支持则丢弃；若整条只剩空，降级为短文本提示。
 */
export function sanitizeContentPartsForModelMedia(
  parts: ContentPart[],
  caps: Pick<ModelMediaCapabilities, 'input'>,
): ContentPart[] {
  const allowImage = modelAcceptsImageInput(caps)
  const allowFile = modelAcceptsFileInput(caps)
  const allowAudio = modelAcceptsAudioInput(caps)
  const out: ContentPart[] = []
  let strippedLabel: string | null = null

  for (const part of parts) {
    if (part.type === 'text') {
      out.push(part)
      continue
    }
    if (part.type === 'image_url') {
      if (allowImage) out.push(part)
      else if (!strippedLabel) strippedLabel = '图片'
      continue
    }
    if (part.type === 'file') {
      if (allowFile) out.push(part)
      else if (!strippedLabel) {
        strippedLabel = part.file.filename?.trim() || '文件'
      }
      continue
    }
    if (part.type === 'input_audio') {
      if (allowAudio) out.push(part)
      else if (!strippedLabel) strippedLabel = '音频'
    }
  }

  const hasText = out.some(p => p.type === 'text' && p.text.trim())
  if (strippedLabel && !hasText) {
    const isKindOnly = strippedLabel === '图片' || strippedLabel === '音频' || strippedLabel === '文件'
    out.push({
      type: 'text',
      text: isKindOnly
        ? `【${strippedLabel}】已本地整理，请用文档工具查阅`
        : `【文件】${strippedLabel}，已本地整理，请用文档工具查阅`,
    })
  }

  return out.length ? out : [{ type: 'text', text: '' }]
}

/** 净化消息列表中的多模态 parts（历史重放安全） */
export function sanitizeMessagesForModelMedia(
  messages: ChatMessage[],
  caps: Pick<ModelMediaCapabilities, 'input'>,
): ChatMessage[] {
  let changed = false
  const next = messages.map(m => {
    const content = m.content
    if (!Array.isArray(content)) return m
    const sanitized = sanitizeContentPartsForModelMedia(content, caps)
    const same = sanitized.length === content.length
      && sanitized.every((p, i) => p === content[i])
    if (same) return m
    changed = true
    return { ...m, content: sanitized }
  })
  return changed ? next : messages
}

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

export function attachmentToContentParts(
  sessionId: string,
  meta: ChatAttachmentMeta,
  _apiBaseUrl: string,
  mediaCaps?: Pick<ModelMediaCapabilities, 'input'> | null,
): ContentPart[] {
  if ((meta.kind === 'pdf' || meta.kind === 'document') && isLibraryExtractReady(meta)) {
    return [{ type: 'text', text: formatDocumentCatalogLine(meta) }]
  }

  if ((meta.kind === 'pdf' || meta.kind === 'document') && meta.extract?.status === 'failed') {
    return [{
      type: 'text',
      text: `【未整理】${meta.name}：${meta.extract.error || '未能整理，请换可读文件后重试'}`,
    }]
  }

  if ((meta.kind === 'pdf' || meta.kind === 'document') && meta.extract?.status === 'pending') {
    return [{
      type: 'text',
      text: `【整理中】${meta.name}：仍在整理，暂不可阅读`,
    }]
  }

  if (meta.kind === 'image') {
    // 图片一律以本地 OCR 文本为主（catalog + document tools）；
    // 仅当模型 input 含 image 时才附带 image_url 作多模态补充
    if (isLibraryExtractReady(meta)) {
      const parts: ContentPart[] = [{ type: 'text', text: formatDocumentCatalogLine(meta) }]
      if (modelAcceptsImageInput(mediaCaps)) {
        const readyBuf = readAttachmentBuffer(sessionId, meta.id)
        if (readyBuf) {
          const b64 = readyBuf.toString('base64')
          const url = `data:${meta.mime};base64,${b64}`
          parts.push({ type: 'image_url', image_url: { url, detail: 'auto' } })
        }
      }
      return parts
    }
    if (meta.extract?.status === 'pending') {
      return [{
        type: 'text',
        text: `【识别中】${meta.name}：正在识别文字，请稍后再问`,
      }]
    }
    if (meta.extract?.status === 'failed') {
      return [{
        type: 'text',
        text: `【识别失败】${meta.name}：${meta.extract.error || '未能识别图片中的文字，请稍后重试或换更清晰的图片'}`,
      }]
    }
    return [{
      type: 'text',
      text: `【识别失败】${meta.name}：暂时无法识别图片中的文字，请稍后重试或换更清晰的图片`,
    }]
  }

  if (meta.kind === 'video' || meta.kind === 'audio') {
    if (isTranscriptExtractReady(meta)) {
      const md = readExtractMarkdown(sessionId, meta.id)?.trim()
      if (md) {
        return [{
          type: 'text',
          text: `【音视频文稿】${meta.name}\n\n${md}`,
        }]
      }
      return [{
        type: 'text',
        text: `【音视频文稿】${meta.name}：暂无可用文字，请重新转写或换文件`,
      }]
    }
    if (meta.extract?.status === 'pending') {
      return [{
        type: 'text',
        text: `【转写中】${meta.name}：正在转写成文字，请稍后再问`,
      }]
    }
    if (meta.extract?.status === 'failed') {
      return [{
        type: 'text',
        text: `【转写失败】${meta.name}：${meta.extract.error || '未能完成转写，请换文件后重试'}`,
      }]
    }
    return [{
      type: 'text',
      text: `【转写失败】${meta.name}：暂时无法转写成文字，请稍后重试`,
    }]
  }

  if (meta.kind === 'pdf' || meta.kind === 'document') {
    return [{
      type: 'text',
      text: `【附件】${meta.name}：尚未整理完成，请稍后再问`,
    }]
  }

  if (!readAttachmentBuffer(sessionId, meta.id)) {
    return [{ type: 'text', text: `[附件 ${meta.name} 不可用]` }]
  }

  return [{ type: 'text', text: `[不支持的附件类型: ${meta.name}]` }]
}

/** @deprecated 使用 attachmentToContentParts */
export function attachmentToContentPart(
  sessionId: string,
  meta: ChatAttachmentMeta,
  apiBaseUrl: string,
  mediaCaps?: Pick<ModelMediaCapabilities, 'input'> | null,
): ContentPart {
  const parts = attachmentToContentParts(sessionId, meta, apiBaseUrl, mediaCaps)
  return parts[0] ?? { type: 'text', text: '' }
}

export function buildUserContentParts(
  text: string,
  sessionId: string,
  attachments: ChatAttachmentMeta[],
  apiBaseUrl: string,
  mediaCaps?: Pick<ModelMediaCapabilities, 'input'> | null,
): ContentPart[] {
  const parts: ContentPart[] = []
  if (text.trim()) parts.push({ type: 'text', text: text.trim() })
  for (const meta of attachments) {
    parts.push(...attachmentToContentParts(sessionId, meta, apiBaseUrl, mediaCaps))
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
