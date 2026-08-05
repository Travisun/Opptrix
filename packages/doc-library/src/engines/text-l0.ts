/**
 * text-l0：纯文本 / Markdown 等直接入库（不恢复版面）。
 */
import type { ParseRunResult, ParseRunner } from '../types.js'
import { buildPageChunks } from './chunk-text.js'

export const TEXT_L0_ENGINE_VERSION = '1.0.0'

function decodeTextBuffer(blob: Buffer): string {
  if (blob.length >= 2) {
    if (blob[0] === 0xff && blob[1] === 0xfe) {
      return blob.subarray(2).toString('utf16le')
    }
    if (blob[0] === 0xfe && blob[1] === 0xff) {
      const swapped = Buffer.alloc(blob.length - 2)
      for (let i = 2; i + 1 < blob.length; i += 2) {
        swapped[i - 2] = blob[i + 1] ?? 0
        swapped[i - 1] = blob[i] ?? 0
      }
      return swapped.toString('utf16le')
    }
  }
  if (blob.length >= 3 && blob[0] === 0xef && blob[1] === 0xbb && blob[2] === 0xbf) {
    return blob.subarray(3).toString('utf8')
  }
  return blob.toString('utf8')
}

export function extractTextL0(blob: Buffer): ParseRunResult {
  const text = decodeTextBuffer(blob).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) {
    return {
      pageCount: 0,
      charCount: 0,
      markdown: '',
      chunks: [],
      error: '未能从该文件提取到可读文本，请确认文件内容后重试',
      emptyPageRatio: 1,
    }
  }
  const markdown = `<!-- page:1 -->\n${text}`
  const chunks = buildPageChunks([{ page: 1, text }])
  return {
    pageCount: 1,
    charCount: markdown.length,
    markdown,
    chunks,
    emptyPageRatio: 0,
  }
}

export function createTextL0Runner(): ParseRunner {
  return {
    engineId: 'text-l0',
    engineVersion: TEXT_L0_ENGINE_VERSION,
    async run(blob) {
      return extractTextL0(blob)
    },
  }
}
