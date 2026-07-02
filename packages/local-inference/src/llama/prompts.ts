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

export function buildImageDescribePrompt(articleTitle?: string): string {
  const titleHint = articleTitle?.trim()
    ? `\n文章标题（供理解语境）：${articleTitle.trim()}`
    : ''
  return [
    '你正在为财经资讯读者提取图片信息。请用中文输出，包含：',
    '1. 图片类型（如数据图表、截图、照片、信息图）',
    '2. 与报道相关的关键信息（数据、结论、人物、事件，不要编造）',
    '3. 图中可见的重要文字（按原文摘录；看不清则写「文字不清晰」）',
    '要求：客观简洁，不要输出乱码、无意义符号或英文提示词；若无有效信息则只写「（未能识别有效内容）」。',
    titleHint,
  ].join('\n')
}

/** @deprecated 使用 buildImageDescribePrompt */
export function buildImageOcrPrompt(articleTitle?: string): string {
  return buildImageDescribePrompt(articleTitle)
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
