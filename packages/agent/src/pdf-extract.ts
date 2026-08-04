/**
 * PDF → Markdown 抽取（正文 + 表格启发式）。
 * 使用 pdf-parse 子路径，避免主入口在 import 时读取测试文件。
 */

export interface PdfExtractPage {
  page: number
  text: string
  tablesMd: string[]
}

export interface PdfExtractChunk {
  id: string
  page: number
  text: string
  offset: number
}

export interface PdfExtractResult {
  pageCount: number
  charCount: number
  markdown: string
  pages: PdfExtractPage[]
  chunks: PdfExtractChunk[]
}

const CHUNK_TARGET_CHARS = 2800

/** 将多空格对齐的行块转为 Markdown 表；失败则返回 null。 */
export function linesToMarkdownTable(lines: string[]): string | null {
  if (lines.length < 2) return null
  const rows = lines.map(line =>
    line
      .trim()
      .split(/\s{2,}/)
      .map(c => c.trim())
      .filter(Boolean),
  )
  const colCount = Math.max(...rows.map(r => r.length))
  if (colCount < 2) return null
  const meaningful = rows.filter(r => r.length >= 2)
  if (meaningful.length < 2) return null
  const pad = (cells: string[]) => {
    const out = [...cells]
    while (out.length < colCount) out.push('')
    return out.map(c => c.replace(/\|/g, '\\|'))
  }
  const header = pad(meaningful[0] ?? [])
  const body = meaningful.slice(1).map(pad)
  const sep = `| ${Array(colCount).fill('---').join(' | ')} |`
  return [
    `| ${header.join(' | ')} |`,
    sep,
    ...body.map(r => `| ${r.join(' | ')} |`),
  ].join('\n')
}

/** 从页面纯文本中挑出疑似表格块并转 Markdown。 */
export function extractTablesFromPageText(pageText: string): { prose: string; tablesMd: string[] } {
  const lines = pageText.split('\n')
  const proseParts: string[] = []
  const tablesMd: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const looksTable = /\S\s{2,}\S/.test(line)
    if (!looksTable) {
      proseParts.push(line)
      i += 1
      continue
    }
    const block: string[] = []
    while (i < lines.length) {
      const cur = lines[i] ?? ''
      if (!/\S\s{2,}\S/.test(cur) && cur.trim() !== '') break
      if (cur.trim() === '' && block.length > 0) {
        i += 1
        break
      }
      if (/\S\s{2,}\S/.test(cur)) block.push(cur)
      else if (cur.trim() === '') {
        i += 1
        break
      } else break
      i += 1
    }
    const md = linesToMarkdownTable(block)
    if (md) tablesMd.push(md)
    else proseParts.push(...block)
  }
  return { prose: proseParts.join('\n').replace(/\n{3,}/g, '\n\n').trim(), tablesMd }
}

function splitPages(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n')
  if (normalized.includes('\f')) {
    return normalized.split('\f').map(p => p.trim()).filter(Boolean)
  }
  // pdf-parse 有时用多重换行近似分页
  const soft = normalized.split(/\n{4,}/).map(p => p.trim()).filter(Boolean)
  if (soft.length > 1) return soft
  return normalized.trim() ? [normalized.trim()] : []
}

function buildChunks(pages: PdfExtractPage[]): PdfExtractChunk[] {
  const chunks: PdfExtractChunk[] = []
  let offset = 0
  let seq = 0
  for (const page of pages) {
    const sections = [page.text, ...page.tablesMd].filter(Boolean)
    const pageBlob = sections.join('\n\n').trim()
    if (!pageBlob) continue
    if (pageBlob.length <= CHUNK_TARGET_CHARS) {
      chunks.push({
        id: `c${seq++}`,
        page: page.page,
        text: pageBlob,
        offset,
      })
      offset += pageBlob.length
      continue
    }
    let start = 0
    while (start < pageBlob.length) {
      let end = Math.min(start + CHUNK_TARGET_CHARS, pageBlob.length)
      if (end < pageBlob.length) {
        const softBreak = pageBlob.lastIndexOf('\n\n', end)
        if (softBreak > start + CHUNK_TARGET_CHARS / 2) end = softBreak
      }
      const slice = pageBlob.slice(start, end).trim()
      if (slice) {
        chunks.push({ id: `c${seq++}`, page: page.page, text: slice, offset })
        offset += slice.length
      }
      start = end
    }
  }
  return chunks
}

export async function extractPdfToMarkdown(data: Buffer | Uint8Array): Promise<PdfExtractResult> {
  // pdf-parse 子路径无官方类型；运行时与 sinafinance/pdf-text 相同
  const mod = await import(
    /* @vite-ignore */
    'pdf-parse/lib/pdf-parse.js' as string
  ) as { default: (buf: Buffer) => Promise<{ text?: string; numpages?: number }> }
  const pdfParse = mod.default
  const result = await pdfParse(Buffer.from(data))
  const raw = String(result.text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const pageTexts = splitPages(raw)
  const pages: PdfExtractPage[] = pageTexts.map((pageText, idx) => {
    const { prose, tablesMd } = extractTablesFromPageText(pageText)
    return {
      page: idx + 1,
      text: prose || pageText.trim(),
      tablesMd,
    }
  })

  // pdf-parse numpages 可能与拆页数不一致；以拆页为准，至少 1
  const pageCount = Math.max(pages.length, Number(result.numpages) || 0, pages.length ? 1 : 0)
  if (pages.length === 0 && pageCount > 0) {
    pages.push({ page: 1, text: '', tablesMd: [] })
  }

  const mdParts: string[] = []
  for (const page of pages) {
    mdParts.push(`<!-- page:${page.page} -->`)
    if (page.text) mdParts.push(page.text)
    for (const table of page.tablesMd) {
      mdParts.push(table)
    }
    mdParts.push('')
  }
  const markdown = mdParts.join('\n').trim()
  const chunks = buildChunks(pages)
  return {
    pageCount: pages.length || pageCount,
    charCount: markdown.length,
    markdown,
    pages,
    chunks,
  }
}

export function formatDocumentCatalogLine(meta: {
  id: string
  name: string
  extract?: { pageCount?: number; charCount?: number; status?: string }
}): string {
  const pages = meta.extract?.pageCount
  const chars = meta.extract?.charCount
  const pagePart = pages != null ? `${pages} 页` : '页数未知'
  const charPart = chars != null
    ? chars >= 10_000
      ? `约 ${(chars / 10_000).toFixed(1)} 万字`
      : `约 ${chars} 字`
    : ''
  const bits = [pagePart, charPart].filter(Boolean).join(' · ')
  return `【研报已整理】${meta.name} · id=${meta.id} · ${bits} · 可用 list_session_documents / search_document / read_document 阅读`
}
