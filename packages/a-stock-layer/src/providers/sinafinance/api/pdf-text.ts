/**
 * 从 PDF 二进制提取纯文本（用于新浪公告附件）。
 * 使用 pdf-parse 子路径，避免主入口在 import 时读取测试文件。
 */

/** Node 24 + pdf-parse 1.1.4: Buffer 会触发 bad XRef；纯 Uint8Array 正常。 */
function toPdfParseInput(data: Uint8Array | Buffer): Uint8Array {
  return new Uint8Array(data)
}

export async function extractPdfPlainText(data: Uint8Array | Buffer): Promise<string> {
  const mod = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default as (buf: Uint8Array) => Promise<{ text?: string }>
  const result = await pdfParse(toPdfParseInput(data))
  return String(result.text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
