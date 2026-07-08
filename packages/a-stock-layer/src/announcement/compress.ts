/** 压缩公告/报告纯文本供 Agent 消费：去 HTML 残留、合并空白 */
export function compressPlainTextForAgent(raw: string): string {
  if (!raw.trim()) return ''
  const stripped = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\u00a0/g, ' ')
  return stripped.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
}

export function isLowQualityExtractedText(text: string): boolean {
  const sample = text.slice(0, 1200)
  if ((sample.match(/\{/g) ?? []).length > 8) return true
  if ((sample.match(/url\(/gi) ?? []).length > 3) return true
  if ((sample.match(/\.secondaryHeader/gi) ?? []).length > 0) return true
  return false
}

export function truncatePlainTextForAgent(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean; charCount: number } {
  const normalized = compressPlainTextForAgent(text)
  const charCount = normalized.length
  if (charCount <= maxChars) {
    return { text: normalized, truncated: false, charCount }
  }
  const slice = normalized.slice(0, maxChars)
  const cut = slice.lastIndexOf('\n', Math.floor(maxChars * 0.92))
  const body = cut > maxChars * 0.5 ? slice.slice(0, cut) : slice
  return {
    text: `${body}\n\n…（正文已截断，原文约 ${charCount} 字）`,
    truncated: true,
    charCount,
  }
}
