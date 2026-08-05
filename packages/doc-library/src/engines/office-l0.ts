/**
 * office-l0：
 * - .docx（mammoth）/ .doc（word-extractor，仅正文，不认图）
 * - .pptx（jszip 读 slide XML `<a:t>`）/ .ppt（ppt-to-text，仅正文，不认图）
 * 不恢复版面；pptx/ppt 尽量按幻灯片分 chunk（page = slide）。
 * docx/pptx 走内嵌图 OCR；旧版 .doc/.ppt 无转换、无内嵌图路径。
 */
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { extOfFilename } from '../document-kind.js'
import type { DocumentKind, ParseRunOpts, ParseRunResult, ParseRunner } from '../types.js'
import { buildPageChunks } from './chunk-text.js'
import {
  enhancePagesWithEmbeddedImageOcr,
  pagesToParseResult,
} from './embedded-images/index.js'
import type { PptToTextModule } from 'ppt-to-text'

export const OFFICE_L0_ENGINE_VERSION = '1.4.0'

type WordExtractorDocument = {
  getBody(): string
  getHeaders(): string
  getFooters(): string
  getFootnotes(): string
  getEndnotes(): string
  getTextboxes(): string
}

type WordExtractorCtor = new () => {
  extract(input: string | Buffer): Promise<WordExtractorDocument>
}

const require = createRequire(import.meta.url)
const pptToText = require('ppt-to-text') as PptToTextModule
const WordExtractor = require('word-extractor') as WordExtractorCtor

const A_T_RE = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi

type OfficeKind = Extract<DocumentKind, 'docx' | 'doc' | 'pptx' | 'ppt'>

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractSlideText(xml: string): string {
  const parts: string[] = []
  A_T_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = A_T_RE.exec(xml)) !== null) {
    const t = decodeXmlEntities(match[1] ?? '').trim()
    if (t) parts.push(t)
  }
  return parts.join('\n').trim()
}

function slideIndex(name: string): number | null {
  const m = /ppt\/slides\/slide(\d+)\.xml$/i.exec(name.replace(/\\/g, '/'))
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function emptyOfficeError(message: string): ParseRunResult {
  return {
    pageCount: 0,
    charCount: 0,
    markdown: '',
    chunks: [],
    error: message,
    emptyPageRatio: 1,
  }
}

function pagesToResult(pages: Array<{ page: number; text: string }>): ParseRunResult {
  if (!pages.length) {
    return emptyOfficeError('未能从该办公文档提取到可读文本')
  }
  const mdParts: string[] = []
  let empty = 0
  for (const s of pages) {
    mdParts.push(`<!-- page:${s.page} -->`)
    if (s.text) mdParts.push(s.text)
    else empty += 1
    mdParts.push('')
  }
  const markdown = mdParts.join('\n').trim()
  const n = pages.length
  return {
    pageCount: n,
    charCount: markdown.length,
    markdown,
    chunks: buildPageChunks(pages),
    emptyPageRatio: n > 0 ? empty / n : 1,
  }
}

export async function extractDocxL0(
  blob: Buffer,
  opts?: ParseRunOpts,
): Promise<ParseRunResult> {
  try {
    opts?.onProgress?.({ phase: 'extracting', message: '正在整理…' })
    const result = await mammoth.extractRawText({ buffer: blob })
    const text = (result.value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    const pages = await enhancePagesWithEmbeddedImageOcr(
      blob,
      [{ page: 1, text }],
      { format: 'docx', onProgress: opts?.onProgress },
    )
    const rebuilt = pagesToParseResult(pages)
    if (rebuilt.charCount <= 0) {
      return emptyOfficeError('未能从该 Word 文档提取到可读文本')
    }
    return rebuilt
  } catch {
    return emptyOfficeError('暂时无法读取该 Word 文档，请换一份文件后重试')
  }
}

/** 旧版 .doc 正文回退 — word-extractor（MIT）；无内嵌图 OCR */
async function extractDocViaWordExtractor(blob: Buffer): Promise<ParseRunResult> {
  try {
    const extractor = new WordExtractor()
    const doc = await extractor.extract(blob)
    const parts = [
      doc.getBody(),
      doc.getHeaders(),
      doc.getFooters(),
      doc.getFootnotes(),
      doc.getEndnotes(),
      doc.getTextboxes(),
    ]
      .map(s => (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim())
      .filter(Boolean)
    const text = parts.join('\n\n').trim()
    if (!text) {
      return emptyOfficeError('未能从该 Word 文档提取到可读文本')
    }
    const markdown = `<!-- page:1 -->\n${text}`
    return {
      pageCount: 1,
      charCount: markdown.length,
      markdown,
      chunks: buildPageChunks([{ page: 1, text }]),
      emptyPageRatio: 0,
    }
  } catch {
    return emptyOfficeError('暂时无法读取该 Word 文档，请换一份文件后重试')
  }
}

/** 旧版 .doc — 仅 word-extractor 正文（不认图、无格式转换） */
export async function extractDocL0(
  blob: Buffer,
  opts?: ParseRunOpts,
): Promise<ParseRunResult> {
  opts?.onProgress?.({ phase: 'extracting', message: '正在整理…' })
  return extractDocViaWordExtractor(blob)
}

export async function extractPptxL0(
  blob: Buffer,
  opts?: ParseRunOpts,
): Promise<ParseRunResult> {
  try {
    opts?.onProgress?.({ phase: 'extracting', message: '正在整理…' })
    const zip = await JSZip.loadAsync(blob)
    const slides: Array<{ page: number; text: string }> = []
    const entries = Object.keys(zip.files)
      .map(name => ({ name, idx: slideIndex(name) }))
      .filter((e): e is { name: string; idx: number } => e.idx !== null)
      .sort((a, b) => a.idx - b.idx)

    for (const entry of entries) {
      const file = zip.file(entry.name)
      if (!file) continue
      const xml = await file.async('string')
      slides.push({ page: entry.idx, text: extractSlideText(xml) })
    }

    // 无 slide XML 时仍尝试内嵌图 OCR（罕见）
    const base = slides.length ? slides : [{ page: 1, text: '' }]
    const enhanced = await enhancePagesWithEmbeddedImageOcr(blob, base, {
      format: 'pptx',
      onProgress: opts?.onProgress,
    })
    const rebuilt = pagesToParseResult(enhanced)
    if (rebuilt.charCount <= 0) {
      return emptyOfficeError('未能从该演示文稿提取到可读文本')
    }
    return rebuilt
  } catch {
    return emptyOfficeError('暂时无法读取该演示文稿，请换一份文件后重试')
  }
}

function extractPptViaNode(blob: Buffer): ParseRunResult {
  try {
    const pres = pptToText.readBuffer(blob)
    const slideTexts = pptToText.utils.to_text(pres)
    if (slideTexts.length > 0) {
      const pages = slideTexts.map((text, i) => ({
        page: i + 1,
        text: String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
      }))
      const nonEmpty = pages.filter(p => p.text)
      if (!nonEmpty.length) {
        return emptyOfficeError('未能从该演示文稿提取到可读文本')
      }
      return pagesToResult(pages)
    }
    const flat = pptToText.extractText(blob, { separator: '\n\n' })
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
    if (!flat) {
      return emptyOfficeError('未能从该演示文稿提取到可读文本')
    }
    return pagesToResult([{ page: 1, text: flat }])
  } catch {
    return emptyOfficeError('暂时无法读取该演示文稿，请换一份文件后重试')
  }
}

/** 旧版 .ppt — 仅 ppt-to-text 正文（Apache-2.0 纯 Node；不认图、无格式转换） */
export async function extractPptL0(
  blob: Buffer,
  opts?: ParseRunOpts,
): Promise<ParseRunResult> {
  opts?.onProgress?.({ phase: 'extracting', message: '正在整理…' })
  return extractPptViaNode(blob)
}

function resolveOfficeKind(opts?: ParseRunOpts): OfficeKind | null {
  if (
    opts?.kind === 'docx'
    || opts?.kind === 'doc'
    || opts?.kind === 'pptx'
    || opts?.kind === 'ppt'
  ) {
    return opts.kind
  }
  const ext = extOfFilename(opts?.filename)
  if (ext === '.docx') return 'docx'
  if (ext === '.doc') return 'doc'
  if (ext === '.pptx') return 'pptx'
  if (ext === '.ppt') return 'ppt'
  const mime = (opts?.mime ?? '').toLowerCase()
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime === 'application/msword' || mime.includes('msword')) return 'doc'
  if (mime.includes('presentationml')) return 'pptx'
  if (mime.includes('ms-powerpoint') || mime.includes('mspowerpoint')) return 'ppt'
  return null
}

function isOleCompound(blob: Buffer): boolean {
  // D0 CF 11 E0 A1 B1 1A E1
  return (
    blob.length >= 8
    && blob[0] === 0xd0
    && blob[1] === 0xcf
    && blob[2] === 0x11
    && blob[3] === 0xe0
  )
}

export function createOfficeL0Runner(): ParseRunner {
  return {
    engineId: 'office-l0',
    engineVersion: OFFICE_L0_ENGINE_VERSION,
    async run(blob, opts) {
      const kind = resolveOfficeKind(opts)
      if (kind === 'docx') return extractDocxL0(blob, opts)
      if (kind === 'doc') return extractDocL0(blob, opts)
      if (kind === 'pptx') return extractPptxL0(blob, opts)
      if (kind === 'ppt') return extractPptL0(blob, opts)

      // 魔数：OOXML ZIP
      if (blob.length >= 4 && blob[0] === 0x50 && blob[1] === 0x4b) {
        try {
          const zip = await JSZip.loadAsync(blob)
          if (Object.keys(zip.files).some(n => /word\/document\.xml$/i.test(n))) {
            return extractDocxL0(blob, opts)
          }
          if (Object.keys(zip.files).some(n => /ppt\/slides\/slide\d+\.xml$/i.test(n))) {
            return extractPptxL0(blob, opts)
          }
        } catch {
          /* fall through */
        }
      }

      // OLE 复合文档：按文件名/MIME 已失败时，优先尝试 .doc，再 .ppt
      if (isOleCompound(blob)) {
        const asDoc = await extractDocL0(blob, opts)
        if (asDoc.charCount > 0 && !asDoc.error) return asDoc
        const asPpt = await extractPptL0(blob, opts)
        if (asPpt.charCount > 0 && !asPpt.error) return asPpt
        return asDoc.error ? asDoc : asPpt
      }

      return emptyOfficeError('暂时无法识别该办公文档格式，请换一份 Word 或演示文稿后重试')
    },
  }
}
