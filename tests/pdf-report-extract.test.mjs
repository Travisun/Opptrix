import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  linesToMarkdownTable,
  extractTablesFromPageText,
  formatDocumentCatalogLine,
  extractPdfToMarkdown,
} from '../packages/agent/dist/pdf-extract.js'
import {
  attachmentToContentPart,
  buildUserContentParts,
  sanitizeMessagesForModelMedia,
} from '../packages/agent/dist/content-parts.js'
import { packIdForTool } from '../packages/shared/dist/tool-packs.js'

const TEXT_ONLY_CAPS = { input: ['text'] }
const VISION_CAPS = { input: ['text', 'image'] }

describe('pdf table heuristics', () => {
  it('converts aligned rows to markdown table', () => {
    const md = linesToMarkdownTable([
      '指标        数值',
      '目标价      120',
      '评级        买入',
    ])
    assert.ok(md)
    assert.match(md, /\| 指标 \| 数值 \|/)
    assert.match(md, /目标价/)
  })

  it('extracts tables from page text', () => {
    const { prose, tablesMd } = extractTablesFromPageText(
      '概述段落\n\n指标        数值\n目标价      120\n评级        买入\n\n结尾',
    )
    assert.ok(prose.includes('概述') || prose.includes('结尾'))
    assert.equal(tablesMd.length, 1)
  })
})

describe('formatDocumentCatalogLine', () => {
  it('includes id and tool hints', () => {
    const line = formatDocumentCatalogLine({
      id: 'att-1',
      name: '中金-某某.pdf',
      extract: { pageCount: 42, charCount: 32000, status: 'ready' },
    })
    assert.match(line, /研报已整理/)
    assert.match(line, /att-1/)
    assert.match(line, /search_document/)
  })
})

describe('content parts for ready PDF', () => {
  it('emits text catalog instead of file part', () => {
    const part = attachmentToContentPart('sess', {
      id: 'a1',
      kind: 'pdf',
      mime: 'application/pdf',
      name: 'demo.pdf',
      size: 1000,
      createdAt: '2026-01-01T00:00:00.000Z',
      extract: { status: 'ready', pageCount: 3, charCount: 1200 },
    }, 'http://127.0.0.1:8787')
    assert.equal(part.type, 'text')
    if (part.type === 'text') {
      assert.match(part.text, /研报已整理/)
      assert.doesNotMatch(part.text, /base64/)
    }

    const parts = buildUserContentParts('对比评级', 'sess', [{
      id: 'a1',
      kind: 'pdf',
      mime: 'application/pdf',
      name: 'demo.pdf',
      size: 1000,
      createdAt: '2026-01-01T00:00:00.000Z',
      extract: { status: 'ready', pageCount: 3, charCount: 1200 },
    }], 'http://127.0.0.1:8787')
    assert.equal(parts.length, 2)
    assert.equal(parts[0].type, 'text')
    assert.equal(parts[1].type, 'text')
  })
})

describe('content parts for image OCR', () => {
  it('ready image injects catalog text (OCR path)', () => {
    const parts = buildUserContentParts('看图', 'sess', [{
      id: 'img1',
      kind: 'image',
      mime: 'image/png',
      name: 'scan.png',
      size: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
      extract: { status: 'ready', pageCount: 1, charCount: 80 },
    }], 'http://127.0.0.1:8787', TEXT_ONLY_CAPS)
    assert.ok(parts.some(p => p.type === 'text' && /研报已整理/.test(p.text)))
    assert.ok(!parts.some(p => p.type === 'image_url'), 'text-only model must not emit image_url')
  })

  it('text-only caps never emit image_url even when vision would', () => {
    const parts = buildUserContentParts('看图', 'sess', [{
      id: 'img1',
      kind: 'image',
      mime: 'image/png',
      name: 'scan.png',
      size: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
      extract: { status: 'ready', pageCount: 1, charCount: 80 },
    }], 'http://127.0.0.1:8787', TEXT_ONLY_CAPS)
    assert.ok(!parts.some(p => p.type === 'image_url'))
  })

  it('vision caps may attach image_url when buffer exists', async () => {
    const { saveAttachment, readAttachmentBuffer } = await import(
      '../packages/agent/dist/chat-attachments.js'
    )
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const prev = process.env.OPPTRIX_DATA_DIR
    const dir = mkdtempSync(join(tmpdir(), 'opptrix-img-parts-'))
    process.env.OPPTRIX_DATA_DIR = dir
    try {
      const sessionId = 'sess-vision'
      const meta = saveAttachment({
        sessionId,
        name: 'scan.png',
        mime: 'image/png',
        data: Buffer.from('fake-png-bytes'),
      })
      meta.extract = { status: 'ready', pageCount: 1, charCount: 80 }
      assert.ok(readAttachmentBuffer(sessionId, meta.id))
      const parts = buildUserContentParts(
        '看图',
        sessionId,
        [meta],
        'http://127.0.0.1:8787',
        VISION_CAPS,
      )
      assert.ok(parts.some(p => p.type === 'text' && /研报已整理/.test(p.text)))
      assert.ok(parts.some(p => p.type === 'image_url'), 'vision model should keep image_url')
    } finally {
      if (prev === undefined) delete process.env.OPPTRIX_DATA_DIR
      else process.env.OPPTRIX_DATA_DIR = prev
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('failed OCR emits clear error without relying on vision alone', () => {
    const parts = buildUserContentParts('看图', 'sess', [{
      id: 'img2',
      kind: 'image',
      mime: 'image/png',
      name: 'scan.png',
      size: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
      extract: { status: 'failed', error: '文字识别尚未就绪' },
    }], 'http://127.0.0.1:8787', TEXT_ONLY_CAPS)
    assert.equal(parts.length, 2)
    assert.equal(parts[1].type, 'text')
    if (parts[1].type === 'text') {
      assert.match(parts[1].text, /识别失败|文字识别/)
    }
    assert.ok(!parts.some(p => p.type === 'image_url'))
  })
})

describe('sanitizeMessagesForModelMedia', () => {
  it('strips historical image_url for text-only models', () => {
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '【研报已整理】scan.png · id=img1' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'auto' } },
      ],
    }]
    const out = sanitizeMessagesForModelMedia(messages, TEXT_ONLY_CAPS)
    assert.equal(out[0].content.length, 1)
    assert.equal(out[0].content[0].type, 'text')
    assert.ok(!JSON.stringify(out).includes('image_url'))
  })

  it('keeps image_url for vision models', () => {
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    }]
    const out = sanitizeMessagesForModelMedia(messages, VISION_CAPS)
    assert.ok(out[0].content.some(p => p.type === 'image_url'))
  })

  it('degrades lone image_url to short text when unsupported', () => {
    const messages = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    }]
    const out = sanitizeMessagesForModelMedia(messages, TEXT_ONLY_CAPS)
    assert.equal(out[0].content.length, 1)
    assert.equal(out[0].content[0].type, 'text')
    assert.match(out[0].content[0].text, /图片/)
    assert.match(out[0].content[0].text, /文档工具/)
  })
})

describe('document tools pack membership', () => {
  it('belongs to core always-on pack', () => {
    assert.equal(packIdForTool('list_session_documents'), 'core')
    assert.equal(packIdForTool('search_document'), 'core')
    assert.equal(packIdForTool('read_document'), 'core')
  })
})

/** 构造可被 pdf-parse 解析的极简多页文本 PDF（Helvetica）。 */
function buildMinimalTextPdf(pageStrings) {
  const kids = []
  const pageObjects = []
  const fontObjNum = 3 + pageStrings.length * 2
  for (let i = 0; i < pageStrings.length; i++) {
    const pageObj = 3 + i * 2
    const contentObj = pageObj + 1
    kids.push(`${pageObj} 0 R`)
    const safe = String(pageStrings[i]).replace(/[()\\]/g, ' ')
    const stream = `BT /F1 24 Tf 50 100 Td (${safe}) Tj ET`
    pageObjects.push({
      num: pageObj,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents ${contentObj} 0 R /Resources<< /Font<< /F1 ${fontObjNum} 0 R >> >> >>`,
    })
    pageObjects.push({
      num: contentObj,
      body: `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream`,
    })
  }
  pageObjects.push({
    num: fontObjNum,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  })

  let body = '%PDF-1.1\n'
  const objOffsets = new Map()
  const writeObj = (num, content) => {
    objOffsets.set(num, Buffer.byteLength(body, 'utf8'))
    body += `${num} 0 obj${content}endobj\n`
  }
  writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  writeObj(2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageStrings.length} >>`)
  for (const obj of pageObjects) {
    writeObj(obj.num, obj.body)
  }
  const xrefStart = Buffer.byteLength(body, 'utf8')
  const maxObj = fontObjNum
  body += `xref\n0 ${maxObj + 1}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i <= maxObj; i++) {
    const off = objOffsets.get(i) ?? 0
    body += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer<< /Size ${maxObj + 1} /Root 1 0 R >>\n`
  body += `startxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(body, 'utf8')
}

describe('extractPdfToMarkdown with minimal PDF', () => {
  it('parses a tiny text PDF buffer', async () => {
    const pdf = buildMinimalTextPdf(['Hello Opptrix'])
    const result = await extractPdfToMarkdown(pdf)
    assert.ok(result.pageCount >= 1)
    assert.ok(result.markdown.includes('<!-- page:'))
    // pdf-parse may or may not extract text from this minimal fixture; ensure no throw
    assert.ok(typeof result.charCount === 'number')
    assert.ok(Array.isArray(result.chunks))
  })

  it('uses pdf-parse numpages for multi-page PDF pageCount and per-page chunks', async () => {
    const pdf = buildMinimalTextPdf(['PageAlphaUnique', 'PageBetaUnique'])
    const parseMod = await import('pdf-parse/lib/pdf-parse.js')
    const pdfParse = parseMod.default
    const parsed = await pdfParse(pdf)
    assert.equal(parsed.numpages, 2, 'fixture must be a 2-page PDF for pdf-parse')

    const result = await extractPdfToMarkdown(pdf)
    assert.equal(result.pageCount, parsed.numpages)
    assert.ok(result.pageCount >= 2)
    assert.ok(result.markdown.includes('<!-- page:1 -->'))
    assert.ok(result.markdown.includes('<!-- page:2 -->'))
    assert.equal(result.pages.length, 2)
    const pageNums = new Set(result.chunks.map(c => c.page))
    assert.ok(pageNums.has(1), 'chunks should include page 1')
    assert.ok(pageNums.has(2), 'chunks should include page 2 when pagerender splits pages')
  })
})
