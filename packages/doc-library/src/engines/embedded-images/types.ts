/** 容器内抽到的一张媒体图（已过滤过小图） */
export type EmbeddedMedia = {
  /** 1-based page / slide */
  page: number
  sha256: string
  bytes: Buffer
  width?: number
  height?: number
}

export type PageText = {
  page: number
  text: string
}

export type EmbeddedImageFormat = 'docx' | 'pptx' | 'pdf'

/** 合并进正文时的标记块标题 */
export const IMAGE_OCR_MARKER = '【图片文字】'

/** 单文档最多 OCR 的内嵌图数量 */
export const MAX_EMBEDDED_IMAGES = 100

/** 字节过小视为图标/装饰，跳过 */
export const MIN_IMAGE_BYTES = 2_048

/** 任一边长过小则跳过（像素） */
export const MIN_IMAGE_EDGE = 32

/** OCR 并行度 */
export const OCR_CONCURRENCY = 3

/** 内嵌图 OCR 总超时；超时保留已有正文 */
export const EMBEDDED_OCR_TIMEOUT_MS = 90_000

export type OcrImageFn = (image: Buffer) => Promise<string>
