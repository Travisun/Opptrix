import { buildPageChunks } from '../chunk-text.js'
import type { ParseRunResult } from '../../types.js'
import { IMAGE_OCR_MARKER, type PageText } from './types.js'

/** 将某页的多段图内文字格式化为追加块 */
export function formatImageOcrBlocks(texts: string[]): string {
  const parts = texts.map(t => t.trim()).filter(Boolean)
  if (!parts.length) return ''
  return parts.map(t => `${IMAGE_OCR_MARKER}\n${t}`).join('\n\n')
}

/**
 * 在对应 page/slide 正文后追加【图片文字】块。
 * 无图文字时原样返回；会为仅有图文字的页补齐 page 行。
 */
export function mergeImageOcrIntoPages(
  pages: PageText[],
  pageOcrTexts: Map<number, string[]>,
): PageText[] {
  const byPage = new Map<number, string>()
  for (const p of pages) {
    byPage.set(p.page, p.text)
  }

  for (const [page, texts] of pageOcrTexts) {
    const block = formatImageOcrBlocks(texts)
    if (!block) continue
    const existing = (byPage.get(page) ?? '').trim()
    byPage.set(page, existing ? `${existing}\n\n${block}` : block)
  }

  const pageNums = new Set<number>([...byPage.keys()])
  for (const p of pageOcrTexts.keys()) pageNums.add(p)
  const sorted = [...pageNums].sort((a, b) => a - b)
  if (!sorted.length) return pages

  return sorted.map(page => ({
    page,
    text: (byPage.get(page) ?? '').trim(),
  }))
}

/** 页列表 → ParseRunResult（含 markdown / chunks） */
export function pagesToParseResult(pages: PageText[]): ParseRunResult {
  if (!pages.length) {
    return {
      pageCount: 0,
      charCount: 0,
      markdown: '',
      chunks: [],
      emptyPageRatio: 1,
      error: '未能从该文档提取到可读文本',
    }
  }
  const mdParts: string[] = []
  let empty = 0
  for (const s of pages) {
    mdParts.push(`<!-- page:${s.page} -->`)
    if (s.text) mdParts.push(s.text)
    else empty += 1
    mdParts.push('')
  }
  const markdown = mdParts.join('\n').trim()
  const n = pages.length
  return {
    pageCount: n,
    charCount: markdown.length,
    markdown,
    chunks: buildPageChunks(pages),
    emptyPageRatio: n > 0 ? empty / n : 1,
  }
}
