import {
  MAX_EMBEDDED_IMAGES,
  MIN_IMAGE_BYTES,
  MIN_IMAGE_EDGE,
  type EmbeddedMedia,
} from './types.js'
import { sha256Of } from './ocr-batch.js'

/**
 * 用 PDFium 按页遍历 XObject/图像对象，导出 PNG buffer。
 * 失败时返回空列表（不阻断正文抽取）。禁止 PyMuPDF。
 */
export async function extractPdfEmbeddedImages(blob: Buffer): Promise<EmbeddedMedia[]> {
  try {
    const { PDFiumLibrary } = await import('@hyzyla/pdfium')
    const sharpMod = await import('sharp')
    const sharp = sharpMod.default
    const library = await PDFiumLibrary.init()
    try {
      const document = await library.loadDocument(new Uint8Array(blob))
      try {
        const out: EmbeddedMedia[] = []
        const pageCount = document.getPageCount()
        for (let i = 0; i < pageCount; i++) {
          if (out.length >= MAX_EMBEDDED_IMAGES) break
          const page = document.getPage(i)
          const pageNo = i + 1
          let objectCount = 0
          try {
            objectCount = page.getObjectCount()
          } catch {
            continue
          }
          for (let oi = 0; oi < objectCount; oi++) {
            if (out.length >= MAX_EMBEDDED_IMAGES) break
            let obj
            try {
              obj = page.getObject(oi)
            } catch {
              continue
            }
            if (obj.type !== 'image') continue
            try {
              const rendered = await obj.render({
                render: async (options) => {
                  return sharp(options.data, {
                    raw: {
                      width: options.width,
                      height: options.height,
                      channels: 4,
                    },
                  })
                    .png()
                    .toBuffer()
                },
              })
              if (
                rendered.width < MIN_IMAGE_EDGE
                || rendered.height < MIN_IMAGE_EDGE
              ) {
                continue
              }
              const bytes = Buffer.from(rendered.data)
              if (bytes.length < MIN_IMAGE_BYTES) continue
              out.push({
                page: pageNo,
                sha256: sha256Of(bytes),
                bytes,
                width: rendered.width,
                height: rendered.height,
              })
            } catch {
              /* 单图失败跳过 */
            }
          }
        }
        return out
      } finally {
        document.destroy()
      }
    } finally {
      library.destroy()
    }
  } catch {
    return []
  }
}
