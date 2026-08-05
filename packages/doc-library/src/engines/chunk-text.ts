import type { ParseChunkInput } from '../types.js'

const CHUNK_TARGET = 2800

/** 按页文本切 chunk（单页过长时软切） */
export function buildPageChunks(
  pages: Array<{ page: number; text: string }>,
): ParseChunkInput[] {
  const chunks: ParseChunkInput[] = []
  let offset = 0
  for (const page of pages) {
    const text = page.text.trim()
    if (!text) continue
    if (text.length <= CHUNK_TARGET) {
      chunks.push({ page: page.page, offset, text })
      offset += text.length
      continue
    }
    let start = 0
    while (start < text.length) {
      let end = Math.min(start + CHUNK_TARGET, text.length)
      if (end < text.length) {
        const soft = text.lastIndexOf('\n\n', end)
        if (soft > start + CHUNK_TARGET / 2) end = soft
      }
      const slice = text.slice(start, end).trim()
      if (slice) {
        chunks.push({ page: page.page, offset, text: slice })
        offset += slice.length
      }
      start = end
    }
  }
  return chunks
}
