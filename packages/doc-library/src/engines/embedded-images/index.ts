/**
 * L0 内嵌图 OCR 增强：从 docx/pptx/pdf 抽图 → 本地 OCR → 合并进对应页。
 * OCR 未就绪：静默保留已有正文，不阻断入库。整份 parse 在后台跑完再 ready。
 */
import { isOcrL2Available, ocrImageBuffer } from '../ocr-l2.js'
import { extractDocxEmbeddedImages, extractPptxEmbeddedImages } from './ooxml-media.js'
import { extractPdfEmbeddedImages } from './pdf-media.js'
import { ocrEmbeddedMediaBatch } from './ocr-batch.js'
import { mergeImageOcrIntoPages, pagesToParseResult } from './merge.js'
import {
  OCR_CONCURRENCY,
  type EmbeddedImageFormat,
  type EmbeddedMedia,
  type OcrImageFn,
  type PageText,
} from './types.js'
import type { ParseProgress, ParseRunResult } from '../../types.js'

export {
  IMAGE_OCR_MARKER,
  MAX_EMBEDDED_IMAGES,
  MIN_IMAGE_BYTES,
  MIN_IMAGE_EDGE,
  OCR_CONCURRENCY,
  EMBEDDED_OCR_TIMEOUT_MS,
} from './types.js'
export type {
  EmbeddedMedia,
  EmbeddedImageFormat,
  OcrImageFn,
  PageText,
} from './types.js'
export { mergeImageOcrIntoPages, pagesToParseResult, formatImageOcrBlocks } from './merge.js'
export { ocrEmbeddedMediaBatch, sha256Of } from './ocr-batch.js'
export { extractDocxEmbeddedImages, extractPptxEmbeddedImages } from './ooxml-media.js'
export { extractPdfEmbeddedImages } from './pdf-media.js'

async function extractMedia(
  blob: Buffer,
  format: EmbeddedImageFormat,
): Promise<EmbeddedMedia[]> {
  if (format === 'docx') return extractDocxEmbeddedImages(blob)
  if (format === 'pptx') return extractPptxEmbeddedImages(blob)
  return extractPdfEmbeddedImages(blob)
}

export type EnhanceEmbeddedOcrOpts = {
  format: EmbeddedImageFormat
  /** 测试可注入；默认走 ocr-l2.ocrImageBuffer */
  ocrFn?: OcrImageFn
  /**
   * @deprecated 默认不再硬超时；仅测试传入正数时启用 Promise.race 截断。
   */
  timeoutMs?: number
  concurrency?: number
  onProgress?: (progress: ParseProgress) => void
}

/**
 * 对已有页文本做内嵌图 OCR 合并。失败/OCR 未就绪 → 返回原 pages。
 * 默认跑完全部内嵌图再返回（依赖外层 scheduleParse + UI 轮询）。
 */
export async function enhancePagesWithEmbeddedImageOcr(
  blob: Buffer,
  pages: PageText[],
  opts: EnhanceEmbeddedOcrOpts,
): Promise<PageText[]> {
  const ocrFn = opts.ocrFn ?? ocrImageBuffer
  // 默认路径：模型未就绪则跳过抽图，不阻断正文入库
  if (!opts.ocrFn && !(await isOcrL2Available())) return pages

  const work = (async (): Promise<PageText[]> => {
    try {
      const media = await extractMedia(blob, opts.format)
      if (!media.length) return pages
      const pageOcr = await ocrEmbeddedMediaBatch(media, ocrFn, {
        concurrency: opts.concurrency ?? OCR_CONCURRENCY,
        onProgress: (done, total) => {
          opts.onProgress?.({
            phase: 'ocr',
            ocrDone: done,
            ocrTotal: total,
            message:
              total > 0
                ? `正在识别图片文字（${done}/${total}）…`
                : '正在识别图片文字…',
          })
        },
      })
      if (!pageOcr.size) return pages
      return mergeImageOcrIntoPages(pages, pageOcr)
    } catch {
      return pages
    }
  })()

  // 仅显式传入正数 timeoutMs 时截断（测试）；生产默认等 OCR 跑完
  const timeoutMs = opts.timeoutMs
  if (timeoutMs == null || timeoutMs <= 0) return work

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<PageText[]>(resolve => {
        timer = setTimeout(() => resolve(pages), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 增强 ParseRunResult；无图/失败时尽量保留原 result */
export async function enhanceParseResultWithEmbeddedImages(
  blob: Buffer,
  result: ParseRunResult,
  opts: EnhanceEmbeddedOcrOpts,
): Promise<ParseRunResult> {
  const pages: PageText[] = result.chunks.length
    ? collapseChunksToPages(result)
    : parsePagesFromMarkdown(result.markdown)

  const basePages = pages.length
    ? pages
    : result.pageCount > 0
      ? Array.from({ length: result.pageCount }, (_, i) => ({ page: i + 1, text: '' }))
      : [{ page: 1, text: '' }]

  const enhanced = await enhancePagesWithEmbeddedImageOcr(blob, basePages, opts)
  const rebuilt = pagesToParseResult(enhanced)
  if (rebuilt.charCount <= 0 && result.charCount > 0) return result
  if (rebuilt.charCount <= 0 && result.error) {
    return { ...result, ...rebuilt, error: result.error }
  }
  return {
    ...rebuilt,
    usedEngineId: result.usedEngineId,
    usedEngineVersion: result.usedEngineVersion,
    error: rebuilt.charCount > 0 ? undefined : result.error,
  }
}

function collapseChunksToPages(result: ParseRunResult): PageText[] {
  const map = new Map<number, string[]>()
  for (const c of result.chunks) {
    const list = map.get(c.page) ?? []
    list.push(c.text)
    map.set(c.page, list)
  }
  // 若 chunk 已含【图片文字】则直接用；否则用 markdown 更完整
  if (map.size === 0) return parsePagesFromMarkdown(result.markdown)
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, parts]) => ({ page, text: parts.join('\n\n').trim() }))
}

function parsePagesFromMarkdown(markdown: string): PageText[] {
  if (!markdown.trim()) return []
  const re = /<!--\s*page:(\d+)\s*-->/g
  const marks: { page: number; start: number; endMarker: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    marks.push({
      page: Number(m[1]),
      start: m.index,
      endMarker: m.index + m[0].length,
    })
  }
  if (!marks.length) {
    return [{ page: 1, text: markdown.trim() }]
  }
  const pages: PageText[] = []
  for (let i = 0; i < marks.length; i++) {
    const cur = marks[i]
    if (!cur) continue
    const nextStart = marks[i + 1]?.start ?? markdown.length
    const text = markdown.slice(cur.endMarker, nextStart).trim()
    pages.push({ page: cur.page, text })
  }
  return pages
}
