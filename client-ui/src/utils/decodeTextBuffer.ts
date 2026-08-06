/**
 * 浏览器侧纯文本解码（UTF-16/UTF-8 BOM；无 BOM 时启发式 UTF-8 vs GB18030/GBK）。
 * 逻辑对齐 packages/doc-library text-l0.decodeTextBuffer；勿依赖 Node Buffer / @opptrix/doc-library。
 */

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
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0x7e)) {
      score += 1
      continue
    }
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

function decodeTextBufferHeuristic(bytes: Uint8Array): string {
  const candidates: Array<{ label: string; text: string; score: number }> = []

  for (const label of ['utf-8', 'gb18030', 'gbk'] as const) {
    if (label === 'gbk' && candidates.some(c => c.label === 'gb18030')) continue
    const text = tryDecodeLabel(bytes, label)
    if (text == null) continue
    candidates.push({ label, text, score: scoreDecodedText(text) })
  }

  if (candidates.length === 0) {
    return tryDecodeLabel(bytes, 'utf-8') ?? ''
  }

  const utf8 = candidates.find(c => c.label === 'utf-8')
  let best = candidates[0]!
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!
    if (c.score > best.score) best = c
  }

  if (utf8 && utf8.score + UTF8_PREFER_MARGIN >= best.score) {
    return utf8.text
  }
  return best.text
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  // 复制为独立视图：Node 池化 Buffer 的 byteOffset 会导致 TextDecoder 读错区间
  const out = new Uint8Array(input.byteLength)
  out.set(input)
  return out
}

/** 解码纯文本 bytes（UTF-8 / UTF-16 BOM；无 BOM 时启发式 UTF-8 vs GB18030） */
export function decodeTextBufferBytes(input: ArrayBuffer | Uint8Array): string {
  const bytes = toBytes(input)
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2))
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      const swapped = new Uint8Array(bytes.length - 2)
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        swapped[i - 2] = bytes[i + 1] ?? 0
        swapped[i - 1] = bytes[i] ?? 0
      }
      return new TextDecoder('utf-16le', { fatal: false }).decode(swapped)
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3))
  }
  return decodeTextBufferHeuristic(bytes)
}
