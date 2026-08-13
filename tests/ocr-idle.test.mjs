/**
 * RapidOCR 按需创建 + 空闲卸载
 */
import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_OCR_IDLE_MS,
  resolveOcrIdleMs,
  releaseOcrInstance,
  closeOcrService,
  setOcrFactoryForTests,
  hasOcrSingletonForTests,
  getOcrLastUsedAtForTests,
  warmOcrInstanceForTests,
  closeDocLibraryService,
  getOcrL2Status,
} from '../packages/doc-library/dist/index.js'

describe('ocr idle unload', () => {
  let prevIdle

  before(() => {
    prevIdle = process.env.OPPTRIX_OCR_IDLE_MS
  })

  afterEach(async () => {
    await closeOcrService()
    setOcrFactoryForTests(null)
  })

  after(async () => {
    if (prevIdle === undefined) delete process.env.OPPTRIX_OCR_IDLE_MS
    else process.env.OPPTRIX_OCR_IDLE_MS = prevIdle
    await closeOcrService()
    setOcrFactoryForTests(null)
  })

  it('resolveOcrIdleMs reads env (0 disables)', () => {
    process.env.OPPTRIX_OCR_IDLE_MS = '0'
    assert.equal(resolveOcrIdleMs(), 0)
    process.env.OPPTRIX_OCR_IDLE_MS = '1500'
    assert.equal(resolveOcrIdleMs(), 1500)
    delete process.env.OPPTRIX_OCR_IDLE_MS
    assert.equal(resolveOcrIdleMs(), DEFAULT_OCR_IDLE_MS)
  })

  it('getOcrL2Status does not create OCR singleton', () => {
    process.env.OPPTRIX_OCR_IDLE_MS = '0'
    assert.equal(hasOcrSingletonForTests(), false)
    getOcrL2Status()
    assert.equal(hasOcrSingletonForTests(), false)
  })

  it('releaseOcrInstance clears singleton and calls dispose when present', async () => {
    process.env.OPPTRIX_OCR_IDLE_MS = '0'
    let disposeCount = 0
    let createCount = 0
    setOcrFactoryForTests(async () => {
      createCount += 1
      return {
        detect: async () => [{ text: 'hello' }],
        dispose: async () => {
          disposeCount += 1
        },
      }
    })

    await warmOcrInstanceForTests()
    assert.equal(hasOcrSingletonForTests(), true)
    assert.equal(createCount, 1)
    assert.ok(getOcrLastUsedAtForTests() > 0)

    await releaseOcrInstance()
    assert.equal(disposeCount, 1)
    assert.equal(hasOcrSingletonForTests(), false)

    await warmOcrInstanceForTests()
    assert.equal(createCount, 2)
    assert.equal(hasOcrSingletonForTests(), true)
  })

  it('idle timer unloads then OCR can recreate', async () => {
    process.env.OPPTRIX_OCR_IDLE_MS = '40'
    let disposeCount = 0
    let createCount = 0
    setOcrFactoryForTests(async () => {
      createCount += 1
      return {
        detect: async () => [{ text: 'tick' }],
        dispose: async () => {
          disposeCount += 1
        },
      }
    })

    await warmOcrInstanceForTests()
    assert.equal(hasOcrSingletonForTests(), true)
    assert.equal(createCount, 1)

    await new Promise(r => setTimeout(r, 100))
    assert.equal(disposeCount, 1)
    assert.equal(hasOcrSingletonForTests(), false)

    await warmOcrInstanceForTests()
    assert.equal(createCount, 2)
    assert.equal(hasOcrSingletonForTests(), true)
  })

  it('close without dispose still clears singleton (GC path)', async () => {
    process.env.OPPTRIX_OCR_IDLE_MS = '0'
    setOcrFactoryForTests(async () => ({
      detect: async () => [{ text: 'no-dispose' }],
    }))
    await warmOcrInstanceForTests()
    assert.equal(hasOcrSingletonForTests(), true)
    await closeOcrService()
    assert.equal(hasOcrSingletonForTests(), false)
  })

  it('closeDocLibraryService clears OCR singleton', async () => {
    process.env.OPPTRIX_OCR_IDLE_MS = '0'
    setOcrFactoryForTests(async () => ({
      detect: async () => [{ text: 'lib' }],
      close: async () => {},
    }))
    await warmOcrInstanceForTests()
    assert.equal(hasOcrSingletonForTests(), true)
    await closeDocLibraryService()
    assert.equal(hasOcrSingletonForTests(), false)
  })
})
