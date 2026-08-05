import { createHash } from 'node:crypto'
import {
  MAX_EMBEDDED_IMAGES,
  OCR_CONCURRENCY,
  type EmbeddedMedia,
  type OcrImageFn,
} from './types.js'

export function sha256Of(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * 对内嵌图批量 OCR：SHA 去重、并行限流、单文档上限。
 * 返回 page → 该页图内文字列表（同图多页复用同一 OCR 结果）。
 */
export async function ocrEmbeddedMediaBatch(
  media: EmbeddedMedia[],
  ocrFn: OcrImageFn,
  opts: { concurrency?: number; maxImages?: number } = {},
): Promise<Map<number, string[]>> {
  const maxImages = opts.maxImages ?? MAX_EMBEDDED_IMAGES
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? OCR_CONCURRENCY, 4))
  const limited = media.slice(0, maxImages)

  const uniqueShas: string[] = []
  const shaToBytes = new Map<string, Buffer>()
  for (const m of limited) {
    if (!shaToBytes.has(m.sha256)) {
      shaToBytes.set(m.sha256, m.bytes)
      uniqueShas.push(m.sha256)
    }
  }

  const shaToText = new Map<string, string>()
  let next = 0

  async function worker(): Promise<void> {
    while (next < uniqueShas.length) {
      const i = next
      next += 1
      const sha = uniqueShas[i]
      if (!sha) continue
      const bytes = shaToBytes.get(sha)
      if (!bytes) continue
      try {
        const text = (await ocrFn(bytes)).trim()
        if (text) shaToText.set(sha, text)
      } catch {
        /* 单项失败静默 */
      }
    }
  }

  if (uniqueShas.length > 0) {
    const workers = Array.from(
      { length: Math.min(concurrency, uniqueShas.length) },
      () => worker(),
    )
    await Promise.all(workers)
  }

  const pageOcr = new Map<number, string[]>()
  const pageSeenSha = new Map<number, Set<string>>()
  for (const m of limited) {
    const text = shaToText.get(m.sha256)
    if (!text) continue
    let seen = pageSeenSha.get(m.page)
    if (!seen) {
      seen = new Set()
      pageSeenSha.set(m.page, seen)
    }
    if (seen.has(m.sha256)) continue
    seen.add(m.sha256)
    const list = pageOcr.get(m.page) ?? []
    list.push(text)
    pageOcr.set(m.page, list)
  }
  return pageOcr
}
