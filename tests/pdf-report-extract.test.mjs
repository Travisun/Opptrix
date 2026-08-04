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
} from '../packages/agent/dist/content-parts.js'
import { packIdForTool } from '../packages/shared/dist/tool-packs.js'

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

describe('document tools pack membership', () => {
  it('belongs to core always-on pack', () => {
    assert.equal(packIdForTool('list_session_documents'), 'core')
    assert.equal(packIdForTool('search_document'), 'core')
    assert.equal(packIdForTool('read_document'), 'core')
  })
})

describe('extractPdfToMarkdown with minimal PDF', () => {
  it('parses a tiny text PDF buffer', async () => {
    // Minimal PDF with one page of text (Hello)
    const pdf = Buffer.from(
      `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 24 Tf 100 100 Td (Hello Opptrix) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000068 00000 n 
0000000125 00000 n 
0000000274 00000 n 
0000000366 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
445
%%EOF`,
      'utf8',
    )
    const result = await extractPdfToMarkdown(pdf)
    assert.ok(result.pageCount >= 1)
    assert.ok(result.markdown.includes('<!-- page:'))
    // pdf-parse may or may not extract text from this minimal fixture; ensure no throw
    assert.ok(typeof result.charCount === 'number')
    assert.ok(Array.isArray(result.chunks))
  })
})
