const MAX_CHUNK_CHARS = 720

function normalizeWhitespace(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

function articleLikelyNeedsChineseTranslation(text) {
  const stripped = String(text ?? '').replace(/\s+/g, '')
  if (!stripped) return false
  const cjk = (stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) ?? []).length
  return cjk / stripped.length < 0.3
}

function buildBatchTranslatePrompt(items, targetLang = 'Chinese') {
  const body = items
    .map((text, index) => `[${index + 1}] ${String(text ?? '').trim()}`)
    .join('\n\n')
  if (targetLang === 'Chinese' || targetLang === 'zh' || targetLang === '中文') {
    return [
      'Translate each numbered item into Chinese.',
      'Keep the same [number] prefix for each line.',
      'Output only the translations, without additional explanation.',
      '',
      body,
    ].join('\n')
  }
  return [
    `Translate each numbered item into ${targetLang}.`,
    'Keep the same [number] prefix for each line.',
    'Output only the translations, without additional explanation.',
    '',
    body,
  ].join('\n')
}

function parseNumberedTranslations(raw, expectedCount) {
  const text = String(raw ?? '').trim()
  if (!text) return []

  const matches = [...text.matchAll(/\[(\d+)\]\s*([^\n\[]+)/g)]
  if (matches.length) {
    const byIndex = new Map()
    for (const match of matches) {
      const index = Number(match[1])
      const value = match[2].trim()
      if (index > 0 && value) byIndex.set(index, value)
    }
    const ordered = []
    for (let i = 1; i <= expectedCount; i += 1) {
      const value = byIndex.get(i)
      if (!value) return []
      ordered.push(value)
    }
    return ordered
  }

  const parts = text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
  if (parts.length === expectedCount) return parts
  return []
}

function buildHtmlTranslatePrompt(sourceHtml, targetLang = 'Chinese') {
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

function cleanHtmlTranslationOutput(raw, sourceHtml) {
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

function estimateHtmlMaxTokens(sourceHtml) {
  const len = String(sourceHtml ?? '').length
  return Math.min(2048, Math.max(256, Math.ceil(len * 1.25) + 64))
}

function cleanBlockTranslationOutput(raw, sourceText) {
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

function estimateMaxTokens(sourceText, itemCount = 1) {
  const len = String(sourceText ?? '').length
  const perItem = Math.max(96, Math.ceil(len * 1.35) + 32)
  return Math.min(512, perItem * Math.max(1, itemCount))
}

function mergeSegmentsForTranslation(segments, maxChars = 900) {
  if (!Array.isArray(segments) || !segments.length) return []

  const merged = []
  let group = { ids: [], texts: [] }
  let size = 0

  const flush = () => {
    if (!group.ids.length) return
    merged.push({
      ids: group.ids,
      texts: group.texts,
      text: group.texts.join('\n\n'),
    })
    group = { ids: [], texts: [] }
    size = 0
  }

  for (const seg of segments) {
    const text = String(seg?.text ?? '').trim()
    const id = String(seg?.id ?? '').trim()
    if (!text || !id) continue

    const nextSize = size === 0 ? text.length : size + 2 + text.length
    if (group.ids.length && nextSize > maxChars) flush()

    group.ids.push(id)
    group.texts.push(text)
    size = nextSize
  }
  flush()
  return merged
}

function buildTranslatePrompt(sourceText, targetLang = 'Chinese') {
  const body = String(sourceText ?? '').trim()
  if (targetLang === 'Chinese' || targetLang === 'zh' || targetLang === '中文') {
    return `Translate the following segment into Chinese, without additional explanation.\n\n${body}`
  }
  return `Translate the following segment into ${targetLang}, without additional explanation.\n\n${body}`
}

function splitIntoChunks(text, maxLen = MAX_CHUNK_CHARS) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= maxLen) return [normalized]

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  const chunks = []
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
  return chunks.length ? chunks : [normalized]
}

function cleanTranslationOutput(raw, sourceText) {
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

  return normalizeWhitespace(text)
}

module.exports = {
  articleLikelyNeedsChineseTranslation,
  buildTranslatePrompt,
  buildHtmlTranslatePrompt,
  buildBatchTranslatePrompt,
  parseNumberedTranslations,
  estimateMaxTokens,
  estimateHtmlMaxTokens,
  mergeSegmentsForTranslation,
  splitIntoChunks,
  cleanTranslationOutput,
  cleanBlockTranslationOutput,
  cleanHtmlTranslationOutput,
  normalizeWhitespace,
}
