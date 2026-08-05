import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectEngine,
  isWeakText,
  metricsFromParseResult,
  ParseRouter,
} from '../packages/doc-library/dist/index.js'

describe('parse-router selectEngine', () => {
  it('defaults to L0 when nothing tried (pdf)', () => {
    const next = selectEngine({
      current: null,
      tried: [],
      kind: 'pdf',
      ocrAvailable: true,
    })
    assert.equal(next, 'pdf-extract-l0')
  })

  it('does not escalate to pdfplumber-l1 (removed)', () => {
    const next = selectEngine({
      current: { charCount: 20, pageCount: 3, emptyPageRatio: 0.8 },
      tried: ['pdf-extract-l0'],
      kind: 'pdf',
      ocrAvailable: false,
      l1Available: true,
    })
    assert.equal(next, null)
  })

  it('escalates weak PDF to ocr-l2 when available', () => {
    const next = selectEngine({
      current: { charCount: 10, pageCount: 2, emptyPageRatio: 1 },
      tried: ['pdf-extract-l0'],
      kind: 'pdf',
      ocrAvailable: true,
    })
    assert.equal(next, 'ocr-l2')
  })

  it('escalates to ocr-l2 when deepParse and available', () => {
    const next = selectEngine({
      current: { charCount: 200, pageCount: 1, emptyPageRatio: 0 },
      tried: ['pdf-extract-l0'],
      kind: 'pdf',
      ocrAvailable: true,
      deepParse: true,
    })
    assert.equal(next, 'ocr-l2')
  })

  it('honors forceEngine unlimited-ocr-l2 alias when OCR available', () => {
    const next = selectEngine({
      current: { charCount: 10, pageCount: 2, emptyPageRatio: 1 },
      tried: ['pdf-extract-l0'],
      kind: 'pdf',
      ocrAvailable: true,
      forceEngine: 'unlimited-ocr-l2',
      deepParse: true,
    })
    assert.equal(next, 'unlimited-ocr-l2')
  })

  it('does not re-escalate OCR after unlimited-ocr-l2 alias tried', () => {
    const next = selectEngine({
      current: { charCount: 10, pageCount: 2, emptyPageRatio: 1 },
      tried: ['pdf-extract-l0', 'unlimited-ocr-l2'],
      kind: 'pdf',
      ocrAvailable: true,
      deepParse: true,
    })
    assert.equal(next, null)
  })

  it('routes text to text-l0', () => {
    const next = selectEngine({
      current: null,
      tried: [],
      kind: 'text',
      ocrAvailable: false,
    })
    assert.equal(next, 'text-l0')
  })

  it('routes docx/doc/pptx/ppt to office-l0', () => {
    for (const kind of ['docx', 'doc', 'pptx', 'ppt']) {
      assert.equal(selectEngine({
        current: null,
        tried: [],
        kind,
        ocrAvailable: false,
      }), 'office-l0', kind)
    }
  })

  it('routes .doc/.ppt filename to office-l0', () => {
    assert.equal(selectEngine({
      current: null,
      tried: [],
      filename: 'report.doc',
      mime: 'application/msword',
      ocrAvailable: false,
    }), 'office-l0')
    assert.equal(selectEngine({
      current: null,
      tried: [],
      filename: 'deck.ppt',
      mime: 'application/vnd.ms-powerpoint',
      ocrAvailable: false,
    }), 'office-l0')
  })

  it('routes image directly to ocr-l2', () => {
    const next = selectEngine({
      current: null,
      tried: [],
      kind: 'image',
      ocrAvailable: true,
    })
    assert.equal(next, 'ocr-l2')
  })

  it('image without OCR yields friendly failure from router', async () => {
    const router = new ParseRouter({
      pdf: {
        engineId: 'pdf-extract-l0',
        engineVersion: 't',
        async run() {
          throw new Error('should not run pdf for image')
        },
      },
      ocr: {
        engineId: 'ocr-l2',
        engineVersion: 't',
        isAvailable: () => false,
        async run() {
          throw new Error('should not run ocr')
        },
      },
    })
    const result = await router.run(Buffer.from('fake-image'), { kind: 'image', mime: 'image/png' })
    assert.equal(result.charCount, 0)
    assert.ok(result.error)
    assert.match(result.error, /暂时无法识别图片/)
  })

  it('ignores forceEngine pdfplumber-l1', () => {
    const next = selectEngine({
      current: null,
      tried: [],
      kind: 'pdf',
      ocrAvailable: false,
      forceEngine: 'pdfplumber-l1',
    })
    assert.equal(next, 'pdf-extract-l0')
  })
})

describe('parse-router run cascade', () => {
  it('mock L0 weak → selects OCR and keeps OCR result', async () => {
    let ocrCalls = 0
    const router = new ParseRouter({
      pdf: {
        engineId: 'pdf-extract-l0',
        engineVersion: 't',
        async run() {
          return {
            pageCount: 2,
            charCount: 10,
            markdown: '<!-- page:1 -->\nx\n<!-- page:2 -->\n',
            chunks: [{ page: 1, offset: 0, text: 'x' }],
            emptyPageRatio: 0.5,
          }
        },
      },
      ocr: {
        engineId: 'ocr-l2',
        engineVersion: 't',
        isAvailable: () => true,
        async run() {
          ocrCalls += 1
          return {
            pageCount: 2,
            charCount: 400,
            markdown: '<!-- page:1 -->\nrich ocr text\n<!-- page:2 -->\nmore',
            chunks: [
              { page: 1, offset: 0, text: 'rich ocr text' },
              { page: 2, offset: 20, text: 'more' },
            ],
            emptyPageRatio: 0,
          }
        },
      },
    })

    const result = await router.run(Buffer.from('pdf'), { kind: 'pdf' })
    assert.equal(ocrCalls, 1)
    assert.equal(result.usedEngineId, 'ocr-l2')
    assert.ok(result.charCount >= 400)
    assert.ok(!isWeakText(metricsFromParseResult(result)))
  })

  it('OCR unavailable → keeps L0 best result', async () => {
    const router = new ParseRouter({
      pdf: {
        engineId: 'pdf-extract-l0',
        engineVersion: 't',
        async run() {
          return {
            pageCount: 1,
            charCount: 30,
            markdown: '<!-- page:1 -->\nweak',
            chunks: [{ page: 1, offset: 0, text: 'weak' }],
            emptyPageRatio: 0,
          }
        },
      },
      ocr: {
        engineId: 'ocr-l2',
        engineVersion: 't',
        isAvailable: () => false,
        async run() {
          throw new Error('should not run')
        },
      },
    })

    const result = await router.run(Buffer.from('pdf'), { kind: 'pdf' })
    assert.equal(result.usedEngineId, 'pdf-extract-l0')
    assert.equal(result.charCount, 30)
  })

  it('OCR unavailable with deepParse does not throw', async () => {
    const router = new ParseRouter({
      pdf: {
        engineId: 'pdf-extract-l0',
        engineVersion: 't',
        async run() {
          return {
            pageCount: 1,
            charCount: 200,
            markdown: '<!-- page:1 -->\nok enough text for pages',
            chunks: [{ page: 1, offset: 0, text: 'ok enough text for pages' }],
            emptyPageRatio: 0,
          }
        },
      },
      ocr: {
        engineId: 'ocr-l2',
        engineVersion: 't',
        isAvailable: () => false,
        async run() {
          return {
            pageCount: 0,
            charCount: 0,
            markdown: '',
            chunks: [],
            error: '扫描件识别尚未就绪',
          }
        },
      },
    })

    const result = await router.run(Buffer.from('pdf'), { kind: 'pdf', deepParse: true })
    assert.ok(result.charCount >= 200)
    assert.equal(result.usedEngineId, 'pdf-extract-l0')
  })

  it('forceEngine unlimited-ocr-l2 alias uses OCR runner', async () => {
    let ocrCalls = 0
    const router = new ParseRouter({
      pdf: {
        engineId: 'pdf-extract-l0',
        engineVersion: 't',
        async run() {
          return {
            pageCount: 1,
            charCount: 10,
            markdown: 'weak',
            chunks: [{ page: 1, offset: 0, text: 'weak' }],
            emptyPageRatio: 1,
          }
        },
      },
      ocr: {
        engineId: 'ocr-l2',
        engineVersion: 't',
        isAvailable: () => true,
        async run() {
          ocrCalls += 1
          return {
            pageCount: 1,
            charCount: 500,
            markdown: '<!-- page:1 -->\ndeep ocr text from scan',
            chunks: [{ page: 1, offset: 0, text: 'deep ocr text from scan' }],
            emptyPageRatio: 0,
          }
        },
      },
    })

    const result = await router.run(Buffer.from('pdf'), {
      kind: 'pdf',
      forceEngine: 'unlimited-ocr-l2',
      deepParse: true,
    })
    assert.equal(ocrCalls, 1)
    assert.equal(result.usedEngineId, 'ocr-l2')
    assert.ok(result.charCount >= 500)
  })

  it('text kind uses text runner only', async () => {
    const router = new ParseRouter({
      text: {
        engineId: 'text-l0',
        engineVersion: 't',
        async run() {
          return {
            pageCount: 1,
            charCount: 12,
            markdown: '<!-- page:1 -->\nhello text',
            chunks: [{ page: 1, offset: 0, text: 'hello text' }],
            emptyPageRatio: 0,
          }
        },
      },
      pdf: {
        engineId: 'pdf-extract-l0',
        engineVersion: 't',
        async run() {
          throw new Error('should not run pdf')
        },
      },
    })
    const result = await router.run(Buffer.from('hello'), { kind: 'text' })
    assert.equal(result.usedEngineId, 'text-l0')
    assert.ok(result.markdown.includes('hello'))
  })
})
