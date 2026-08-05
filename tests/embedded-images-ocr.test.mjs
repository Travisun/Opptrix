import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import {
  extractPptxEmbeddedImages,
  extractDocxEmbeddedImages,
  mergeImageOcrIntoPages,
  formatImageOcrBlocks,
  enhancePagesWithEmbeddedImageOcr,
  pagesToParseResult,
  IMAGE_OCR_MARKER,
  ocrEmbeddedMediaBatch,
  sha256Of,
} from '../packages/doc-library/dist/index.js'

/** 最小合法 PNG（1×1），再 pad 到超过 MIN_IMAGE_BYTES */
function makePngFixture(labelByte = 0x41) {
  // 89 50 4E 47 … 标准 1x1 PNG
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
      + '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex',
  )
  const pad = Buffer.alloc(3_000, labelByte)
  return Buffer.concat([png, pad])
}

describe('embedded-images merge', () => {
  it('appends 【图片文字】 after page text', () => {
    const pages = [
      { page: 1, text: '正文 A' },
      { page: 2, text: '正文 B' },
    ]
    const ocr = new Map([
      [1, ['图中标题']],
      [2, ['脚注']],
    ])
    const merged = mergeImageOcrIntoPages(pages, ocr)
    assert.ok(merged[0].text.includes('正文 A'))
    assert.ok(merged[0].text.includes(IMAGE_OCR_MARKER))
    assert.ok(merged[0].text.includes('图中标题'))
    assert.ok(merged[1].text.includes('脚注'))
  })

  it('formatImageOcrBlocks joins multiple images', () => {
    const block = formatImageOcrBlocks(['一', '二'])
    assert.equal(block.split(IMAGE_OCR_MARKER).length - 1, 2)
  })
})

describe('ooxml media extract', () => {
  it('pptx maps media to slide via relationships', async () => {
    const img1 = makePngFixture(0x11)
    const img2 = makePngFixture(0x22)
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:blip r:embed="rId2"/><a:t>标题一</a:t></p:sld>`,
    )
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
    )
    zip.file(
      'ppt/slides/slide2.xml',
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:blip r:embed="rId2"/><a:t>标题二</a:t></p:sld>`,
    )
    zip.file(
      'ppt/slides/_rels/slide2.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/></Relationships>`,
    )
    zip.file('ppt/media/image1.png', img1)
    zip.file('ppt/media/image2.png', img2)
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    const media = await extractPptxEmbeddedImages(buf)
    assert.equal(media.length, 2)
    assert.ok(media.some(m => m.page === 1 && m.sha256 === sha256Of(img1)))
    assert.ok(media.some(m => m.page === 2 && m.sha256 === sha256Of(img2)))
  })

  it('docx assigns all media to page 1', async () => {
    const img = makePngFixture(0x33)
    const zip = new JSZip()
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:t>hello</w:t></w:document>')
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`,
    )
    zip.file('word/media/image1.png', img)
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    const media = await extractDocxEmbeddedImages(buf)
    assert.equal(media.length, 1)
    assert.equal(media[0].page, 1)
    assert.equal(media[0].sha256, sha256Of(img))
  })
})

describe('ocr batch + enhance (mock OCR)', () => {
  it('dedupes same SHA across pages and merges into pages', async () => {
    const img = makePngFixture(0x44)
    const sha = sha256Of(img)
    const media = [
      { page: 1, sha256: sha, bytes: img },
      { page: 2, sha256: sha, bytes: img },
    ]
    let calls = 0
    const pageOcr = await ocrEmbeddedMediaBatch(media, async () => {
      calls += 1
      return '共享图文'
    })
    assert.equal(calls, 1)
    assert.equal(pageOcr.get(1)?.[0], '共享图文')
    assert.equal(pageOcr.get(2)?.[0], '共享图文')
  })

  it('enhancePagesWithEmbeddedImageOcr merges mock OCR into pptx', async () => {
    const img = makePngFixture(0x55)
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:blip r:embed="rId2"/><a:t>幻灯片正文</a:t></p:sld>`,
    )
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
    )
    zip.file('ppt/media/image1.png', img)
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    const enhanced = await enhancePagesWithEmbeddedImageOcr(
      buf,
      [{ page: 1, text: '幻灯片正文' }],
      {
        format: 'pptx',
        ocrFn: async () => '图内识别结果',
      },
    )
    assert.ok(enhanced[0].text.includes('幻灯片正文'))
    assert.ok(enhanced[0].text.includes('图内识别结果'))
    assert.ok(enhanced[0].text.includes(IMAGE_OCR_MARKER))

    const result = pagesToParseResult(enhanced)
    assert.ok(result.markdown.includes('图内识别结果'))
    assert.ok(result.chunks.some(c => c.text.includes('图内识别结果')))
  })

  it('timeout keeps existing page text', async () => {
    const img = makePngFixture(0x66)
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><a:blip r:embed="rId2"/><a:t>保留正文</a:t></p:sld>`,
    )
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
    )
    zip.file('ppt/media/image1.png', img)
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    const pages = [{ page: 1, text: '保留正文' }]
    const enhanced = await enhancePagesWithEmbeddedImageOcr(buf, pages, {
      format: 'pptx',
      timeoutMs: 30,
      ocrFn: async () => {
        await new Promise(r => setTimeout(r, 500))
        return '不应出现'
      },
    })
    assert.equal(enhanced[0].text, '保留正文')
    assert.ok(!enhanced[0].text.includes('不应出现'))
  })

  it('OCR throw keeps existing page text (no fail)', async () => {
    const img = makePngFixture(0x77)
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><a:blip r:embed="rId2"/><a:t>降级正文</a:t></p:sld>`,
    )
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
    )
    zip.file('ppt/media/image1.png', img)
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    const pages = [{ page: 1, text: '降级正文' }]
    const enhanced = await enhancePagesWithEmbeddedImageOcr(buf, pages, {
      format: 'pptx',
      ocrFn: async () => {
        throw new Error('ocr unavailable')
      },
    })
    assert.equal(enhanced[0].text, '降级正文')
    assert.ok(!enhanced[0].text.includes(IMAGE_OCR_MARKER))
  })
})

describe('sha helper', () => {
  it('sha256Of matches crypto', () => {
    const buf = Buffer.from('abc')
    assert.equal(sha256Of(buf), createHash('sha256').update(buf).digest('hex'))
  })
})
