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

/**
 * 单文档最多 OCR 的内嵌图数量（硬上限，防无界占内存）。
 * 按页抽图时同样受此上限约束；装饰小图另由 MIN_IMAGE_* 过滤。
 */
export const MAX_EMBEDDED_IMAGES = 300

/** 字节过小视为图标/装饰，跳过 */
export const MIN_IMAGE_BYTES = 2_048

/** 任一边长过小则跳过（像素） */
export const MIN_IMAGE_EDGE = 32

/**
 * @deprecated 内嵌 OCR 不再硬截断；整份 parse 在后台跑完再 markParseReady。
 * 保留常量以免旧 import 炸；传 timeoutMs 时仍可测试用短超时。
 */
export const EMBEDDED_OCR_TIMEOUT_MS = 0

export type OcrImageFn = (image: Buffer) => Promise<string>
