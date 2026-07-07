/**
 * 从 PDF 二进制提取纯文本（用于新浪公告附件）。
 * 使用 pdf-parse 子路径，避免主入口在 import 时读取测试文件。
 */
export async function extractPdfPlainText(data: Uint8Array | Buffer): Promise<string> {
  const mod = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default as (buf: Buffer) => Promise<{ text?: string }>
  const result = await pdfParse(Buffer.from(data))
  return String(result.text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
