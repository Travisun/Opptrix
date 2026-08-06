/**
 * text-l0：纯文本 / Markdown 等直接入库（不恢复版面）。
 */
import type { ParseRunResult, ParseRunner } from '../types.js'
import { buildPageChunks } from './chunk-text.js'

export const TEXT_L0_ENGINE_VERSION = '1.0.0'

const CJK_START = 0x4e00
const CJK_END = 0x9fff
const REPLACEMENT = 0xfffd
/** UTF-8 与最佳候选分差在此以内时优先 UTF-8，避免误伤纯 ASCII */
const UTF8_PREFER_MARGIN = 8

function scoreDecodedText(text: string): number {
  let score = 0
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i)
    if (cp === REPLACEMENT) {
      score -= 50
      continue
    }
    if (cp >= CJK_START && cp <= CJK_END) {
      score += 3
      continue
    }
    // 可打印 ASCII + 常见空白
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0x7e)) {
      score += 1
      continue
    }
    // 其他常见可打印 Unicode（拉丁扩展等）
    if (cp >= 0xa0 && cp < 0xd800) {
      score += 1
    }
  }
  return score
}

function tryDecodeLabel(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes)
  } catch {
    return null
  }
}

/** 无 BOM：启发式 UTF-8 vs GB18030/GBK */
function decodeTextBufferHeuristic(blob: Buffer): string {
  const bytes = new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength)
  const candidates: Array<{ label: string; text: string; score: number }> = []

  for (const label of ['utf-8', 'gb18030', 'gbk'] as const) {
    // gb18030 已成功时跳过 gbk（超集）
    if (label === 'gbk' && candidates.some(c => c.label === 'gb18030')) continue
    const text = tryDecodeLabel(bytes, label)
    if (text == null) continue
    candidates.push({ label, text, score: scoreDecodedText(text) })
  }

  if (candidates.length === 0) {
    return blob.toString('utf8')
  }

  const utf8 = candidates.find(c => c.label === 'utf-8')
  let best = candidates[0]!
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!
    if (c.score > best.score) best = c
  }

  // UTF-8 分数接近或更好时优先（避免误伤纯 ASCII）
  if (utf8 && utf8.score + UTF8_PREFER_MARGIN >= best.score) {
    return utf8.text
  }
  return best.text
}

/** 解码纯文本 buffer（UTF-8 / UTF-16 BOM；无 BOM 时启发式 UTF-8 vs GB18030） */
export function decodeTextBuffer(blob: Buffer): string {
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
  return decodeTextBufferHeuristic(blob)
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
