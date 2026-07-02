/** 判断本地小模型输出是否明显不可用（乱码、空、噪声） */
export function isLowQualityImageExtraction(text: string): boolean {
  const t = String(text ?? '').trim()
  if (!t || t.length < 6) return true
  if (t === '（未能识别有效内容）') return false
  if (/[\uFFFD]/.test(t)) return true

  const replacementNoise = (t.match(/[□■◆◇]/g) ?? []).length
  if (replacementNoise >= 2) return true

  const latinWords = t.match(/[A-Za-z]{3,}/g) ?? []
  const promptEcho = latinWords.some(w => /extract|visible|plain|image|output|explanation/i.test(w))
  if (promptEcho && !/[\u4e00-\u9fff]/.test(t)) return true

  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length
  if (cjk === 0 && t.length > 20) return true

  const tokens = t.split(/\s+/).filter(Boolean)
  if (tokens.length >= 8) {
    const singleChar = tokens.filter(tok => tok.length === 1).length
    if (singleChar / tokens.length > 0.45) return true
  }

  return false
}

export function cleanVisionOutput(raw: string, prompt?: string): string {
  let text = String(raw ?? '').trim()
  if (!text) return ''

  const promptBody = String(prompt ?? '').trim()
  if (promptBody && text.startsWith(promptBody)) {
    text = text.slice(promptBody.length).trim()
  }

  text = text
    .replace(/\uFFFD/g, '')
    .replace(/^[:\s\-]+/, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}
