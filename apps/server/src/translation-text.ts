export function articleLikelyNeedsChineseTranslation(text: string): boolean {
  const stripped = String(text ?? '').replace(/\s+/g, '')
  if (!stripped) return false
  const cjk = (stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) ?? []).length
  return cjk / stripped.length < 0.3
}

export function buildTranslatePrompt(sourceText: string, targetLang = 'Chinese'): string {
  const body = String(sourceText ?? '').trim()
  if (targetLang === 'Chinese' || targetLang === 'zh' || targetLang === '中文') {
    return `Translate the following segment into Chinese, without additional explanation.\n\n${body}`
  }
  return `Translate the following segment into ${targetLang}, without additional explanation.\n\n${body}`
}

export function buildHtmlTranslatePrompt(sourceHtml: string, targetLang = 'Chinese'): string {
  const body = String(sourceHtml ?? '').trim()
  if (targetLang === 'Chinese' || targetLang === 'zh' || targetLang === '中文') {
    return [
      'Translate only the human-readable text in the following HTML into Chinese.',
      'Keep all HTML tags, attributes, URLs, and structure exactly unchanged.',
      'Output only the translated HTML without additional explanation.',
      '',
      body,
    ].join('\n')
  }
  return [
    `Translate only the human-readable text in the following HTML into ${targetLang}.`,
    'Keep all HTML tags, attributes, URLs, and structure exactly unchanged.',
    'Output only the translated HTML without additional explanation.',
    '',
    body,
  ].join('\n')
}

export function cleanBlockTranslationOutput(raw: string, sourceText: string): string {
  let text = String(raw ?? '').trim()
  if (!text) return ''

  const source = String(sourceText ?? '').trim()
  if (source && text.startsWith(source)) {
    text = text.slice(source.length).trim()
  }

  const markers = [
    'Translate the following segment into',
    'without additional explanation.',
    '将以下文本翻译为',
    '将以下英文翻译为中文',
    '只输出译文',
    '不要解释',
    '注意只需要输出翻译后的结果',
  ]
  for (const marker of markers) {
    const idx = text.indexOf(marker)
    if (idx >= 0 && idx < 80) {
      text = text.slice(idx + marker.length).trim()
    }
  }

  return text.replace(/\s+/g, ' ').trim()
}

export function cleanHtmlTranslationOutput(raw: string, sourceHtml: string): string {
  let text = String(raw ?? '').trim()
  if (!text) return ''

  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fenced) text = fenced[1].trim()

  const source = String(sourceHtml ?? '').trim()
  if (source && text.startsWith(source)) {
    text = text.slice(source.length).trim()
  }

  const start = text.indexOf('<')
  const end = text.lastIndexOf('>')
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1).trim()
  }

  return text
}

export function normalizeWhitespace(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

const MAX_CHUNK_CHARS = 1200

/** 无 segments 时将纯文本正文切段，供离线翻译循环 */
export function splitIntoChunks(text: string, maxLen = MAX_CHUNK_CHARS): string[] {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= maxLen) return [normalized]

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let buffer = ''

  const flush = () => {
    if (!buffer.trim()) return
    chunks.push(buffer.trim())
    buffer = ''
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLen) {
      flush()
      let rest = paragraph
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(' ', maxLen)
        if (cut < maxLen * 0.5) cut = maxLen
        chunks.push(rest.slice(0, cut).trim())
        rest = rest.slice(cut).trim()
      }
      if (rest) buffer = rest
      continue
    }

    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    if (next.length > maxLen) {
      flush()
      buffer = paragraph
    } else {
      buffer = next
    }
  }
  flush()
  return chunks
}
