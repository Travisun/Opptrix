import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {
  extractTextL0,
  decodeTextBuffer,
  extractDocxL0,
  extractDocL0,
  extractPptxL0,
  extractPptL0,
  createOfficeL0Runner,
  documentKindFromMime,
} from '../packages/doc-library/dist/index.js'

describe('text-l0 extract', () => {
  it('extracts utf8 plain text as one page', () => {
    const result = extractTextL0(Buffer.from('第一行\n第二行', 'utf8'))
    assert.equal(result.pageCount, 1)
    assert.ok(result.charCount > 0)
    assert.ok(result.markdown.includes('第一行'))
    assert.equal(result.chunks.length, 1)
    assert.equal(result.chunks[0].page, 1)
  })

  it('strips utf8 BOM', () => {
    const result = extractTextL0(Buffer.from('\uFEFF标题\n正文', 'utf8'))
    assert.ok(result.markdown.includes('标题'))
    assert.ok(!result.error)
  })

  it('decodes GBK Chinese without BOM (你好 = C4 E3 BA C3)', () => {
    const gbkNiHao = Buffer.from([0xc4, 0xe3, 0xba, 0xc3])
    assert.equal(decodeTextBuffer(gbkNiHao), '你好')
    const result = extractTextL0(gbkNiHao)
    assert.ok(result.markdown.includes('你好'))
    assert.ok(!result.error)
  })

  it('decodes GB18030 Chinese without BOM', () => {
    // 「中文」GB18030/GBK：D6 D0 CE C4
    const buf = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])
    assert.equal(decodeTextBuffer(buf), '中文')
    const result = extractTextL0(buf)
    assert.ok(result.markdown.includes('中文'))
    assert.ok(!result.error)
  })

  it('keeps UTF-8 Chinese preferred over GBK mis-decode', () => {
    const utf8 = Buffer.from('你好世界', 'utf8')
    assert.equal(decodeTextBuffer(utf8), '你好世界')
  })

  it('decodes UTF-16 LE BOM', () => {
    const le = Buffer.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]) // 你好
    assert.equal(decodeTextBuffer(le), '你好')
    const result = extractTextL0(le)
    assert.ok(result.markdown.includes('你好'))
  })

  it('keeps pure ASCII as UTF-8', () => {
    assert.equal(decodeTextBuffer(Buffer.from('hello\nworld', 'utf8')), 'hello\nworld')
  })
})

describe('office-l0 pptx', () => {
  it('chunks by slide (page = slide index)', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:t>第一页标题</a:t></p:sld>`,
    )
    zip.file(
      'ppt/slides/slide2.xml',
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:t>第二页内容</a:t><a:t>补充</a:t></p:sld>`,
    )
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    const result = await extractPptxL0(buf)
    assert.equal(result.pageCount, 2)
    assert.ok(result.markdown.includes('<!-- page:1 -->'))
    assert.ok(result.markdown.includes('<!-- page:2 -->'))
    assert.ok(result.chunks.some(c => c.page === 1 && c.text.includes('第一页')))
    assert.ok(result.chunks.some(c => c.page === 2 && c.text.includes('第二页')))
  })
})

describe('office-l0 docx via runner', () => {
  it('returns friendly error for non-office zip', async () => {
    const zip = new JSZip()
    zip.file('readme.txt', 'hi')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    const runner = createOfficeL0Runner()
    const result = await runner.run(buf, { kind: 'docx', filename: 'x.docx' })
    // mammoth may fail or return empty — either way should not throw
    assert.ok(typeof result.charCount === 'number')
    assert.ok(Array.isArray(result.chunks))
  })
})

describe('office-l0 docx extract helper', () => {
  it('extractDocxL0 handles empty/invalid buffer without throw', async () => {
    const result = await extractDocxL0(Buffer.from('not-a-docx'))
    assert.equal(result.pageCount, 0)
    assert.ok(result.error)
  })
})

describe('documentKindFromMime legacy office', () => {
  it('maps .doc / .ppt mime and extension', () => {
    assert.equal(documentKindFromMime('application/msword', 'a.doc'), 'doc')
    assert.equal(documentKindFromMime('application/octet-stream', 'a.doc'), 'doc')
    assert.equal(documentKindFromMime('application/vnd.ms-powerpoint', 'b.ppt'), 'ppt')
    assert.equal(documentKindFromMime('application/octet-stream', 'b.ppt'), 'ppt')
    assert.equal(
      documentKindFromMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'a.docx',
      ),
      'docx',
    )
    assert.equal(
      documentKindFromMime(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'b.pptx',
      ),
      'pptx',
    )
  })

  it('maps txt/md/csv/json to text', () => {
    assert.equal(documentKindFromMime('text/plain', 'a.txt'), 'text')
    assert.equal(documentKindFromMime('text/markdown', 'a.md'), 'text')
    assert.equal(documentKindFromMime('text/csv', 'a.csv'), 'text')
    assert.equal(documentKindFromMime('application/json', 'a.json'), 'text')
    assert.equal(documentKindFromMime('application/octet-stream', 'notes.txt'), 'text')
  })
})

describe('office-l0 legacy doc/ppt', () => {
  it('extractDocL0 returns friendly error for invalid buffer', async () => {
    const result = await extractDocL0(Buffer.from('not-a-doc'))
    assert.equal(result.pageCount, 0)
    assert.ok(result.error)
  })

  it('extractPptL0 returns friendly error for invalid buffer', async () => {
    const result = await extractPptL0(Buffer.from('not-a-ppt'))
    assert.equal(result.pageCount, 0)
    assert.ok(result.error)
  })

  it('runner routes kind=doc and kind=ppt without throw', async () => {
    const runner = createOfficeL0Runner()
    const doc = await runner.run(Buffer.from('x'), { kind: 'doc', filename: 'a.doc' })
    assert.ok(typeof doc.charCount === 'number')
    assert.ok(Array.isArray(doc.chunks))
    const ppt = await runner.run(Buffer.from('x'), { kind: 'ppt', filename: 'a.ppt' })
    assert.ok(typeof ppt.charCount === 'number')
    assert.ok(Array.isArray(ppt.chunks))
  })
})
