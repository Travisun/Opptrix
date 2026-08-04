import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectEngine,
  isWeakText,
  metricsFromParseResult,
  ParseRouter,
} from '../packages/doc-library/dist/index.js'

describe('parse-router selectEngine', () => {
  it('defaults to L0 when nothing tried', () => {
    const next = selectEngine({
      current: null,
      tried: [],
      l1Available: true,
      l2Available: true,
    })
    assert.equal(next, 'pdf-extract-l0')
  })

  it('escalates weak L0 to L1 when available', () => {
    const next = selectEngine({
      current: { charCount: 20, pageCount: 3, emptyPageRatio: 0.8 },
      tried: ['pdf-extract-l0'],
      l1Available: true,
      l2Available: false,
    })
    assert.equal(next, 'pdfplumber-l1')
  })

  it('keeps L0 path when L1 unavailable (no next engine without deepParse)', () => {
    const next = selectEngine({
      current: { charCount: 20, pageCount: 3, emptyPageRatio: 0.8 },
      tried: ['pdf-extract-l0'],
      l1Available: false,
      l2Available: false,
    })
    assert.equal(next, null)
  })

  it('does not escalate to L2 without deepParse/force even if weak and L2 available', () => {
    const next = selectEngine({
      current: { charCount: 10, pageCount: 2, emptyPageRatio: 1 },
      tried: ['pdf-extract-l0', 'pdfplumber-l1'],
      l1Available: true,
      l2Available: true,
      deepParse: false,
    })
    assert.equal(next, null)
  })

  it('escalates to L2 when deepParse and available', () => {
    const next = selectEngine({
      current: { charCount: 10, pageCount: 2, emptyPageRatio: 1 },
      tried: ['pdf-extract-l0', 'pdfplumber-l1'],
      l1Available: true,
      l2Available: true,
      deepParse: true,
    })
    assert.equal(next, 'unlimited-ocr-l2')
  })

  it('honors forceEngine when available', () => {
    const next = selectEngine({
      current: null,
      tried: [],
      l1Available: true,
      l2Available: false,
      forceEngine: 'pdfplumber-l1',
    })
    assert.equal(next, 'pdfplumber-l1')
  })
})

describe('parse-router run cascade', () => {
  it('mock L0 weak → selects L1 and keeps L1 result', async () => {
    let l1Calls = 0
    const router = new ParseRouter({
      l0: {
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
      l1: {
        engineId: 'pdfplumber-l1',
        engineVersion: 't',
        isAvailable: () => true,
        async run() {
          l1Calls += 1
          return {
            pageCount: 2,
            charCount: 400,
            markdown: '<!-- page:1 -->\nrich layout text\n<!-- page:2 -->\nmore',
            chunks: [
              { page: 1, offset: 0, text: 'rich layout text' },
              { page: 2, offset: 20, text: 'more' },
            ],
            emptyPageRatio: 0,
          }
        },
      },
    })

    const result = await router.run(Buffer.from('pdf'))
    assert.equal(l1Calls, 1)
    assert.equal(result.usedEngineId, 'pdfplumber-l1')
    assert.ok(result.charCount >= 400)
    assert.ok(!isWeakText(metricsFromParseResult(result)))
  })

  it('L1 unavailable → keeps L0 best result', async () => {
    const router = new ParseRouter({
      l0: {
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
      l1: {
        engineId: 'pdfplumber-l1',
        engineVersion: 't',
        isAvailable: () => false,
        async run() {
          throw new Error('should not run')
        },
      },
    })

    const result = await router.run(Buffer.from('pdf'))
    assert.equal(result.usedEngineId, 'pdf-extract-l0')
    assert.equal(result.charCount, 30)
  })

  it('L2 unavailable with deepParse does not throw', async () => {
    const router = new ParseRouter({
      l0: {
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
      l2: {
        engineId: 'unlimited-ocr-l2',
        engineVersion: 't',
        isAvailable: () => false,
        async run() {
          return {
            pageCount: 0,
            charCount: 0,
            markdown: '',
            chunks: [],
            error: '深度整理引擎尚未安装或未配置模型',
          }
        },
      },
    })

    const result = await router.run(Buffer.from('pdf'), { deepParse: true })
    assert.ok(result.charCount >= 200)
    assert.equal(result.usedEngineId, 'pdf-extract-l0')
  })
})
