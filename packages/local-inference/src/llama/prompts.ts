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

export function buildImageOcrPrompt(): string {
  return 'Extract all visible text in this image. Output plain text only, preserve line breaks. No explanation.'
}

export function cleanTranslationOutput(raw: string, sourceText: string): string {
  let text = String(raw ?? '').trim()
  const source = String(sourceText ?? '').trim()
  if (source && text.startsWith(source)) {
    text = text.slice(source.length).trim()
  }
  return text.replace(/\s+/g, ' ').trim()
}

export function cleanBlockTranslationOutput(raw: string, sourceText: string): string {
  return cleanTranslationOutput(raw, sourceText)
}

export function cleanHtmlTranslationOutput(raw: string, sourceHtml: string): string {
  let text = String(raw ?? '').trim()
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

export function estimateMaxTokens(sourceText: string): number {
  const len = String(sourceText ?? '').length
  return Math.min(512, Math.max(96, Math.ceil(len * 1.35) + 32))
}

export function estimateHtmlMaxTokens(sourceHtml: string): number {
  const len = String(sourceHtml ?? '').length
  return Math.min(2048, Math.max(256, Math.ceil(len * 1.25) + 64))
}
