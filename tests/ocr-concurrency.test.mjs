/**
 * resolveOcrConcurrency — 低配 / env / embedding 互斥
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  resolveOcrConcurrency,
  OCR_CONCURRENCY_DEFAULT,
  OCR_CONCURRENCY_LOW,
  OCR_CONCURRENCY_MAX,
  OCR_CONCURRENCY_WITH_EMBEDDING,
} = await import('../packages/doc-library/dist/engines/embedded-images/ocr-concurrency.js')

const MEM_ENV = 'OPPTRIX_SQLITE_MEM_PROFILE'
const OCR_ENV = 'OPPTRIX_OCR_CONCURRENCY'
const prevMem = process.env[MEM_ENV]
const prevOcr = process.env[OCR_ENV]

afterEach(() => {
  if (prevMem === undefined) delete process.env[MEM_ENV]
  else process.env[MEM_ENV] = prevMem
  if (prevOcr === undefined) delete process.env[OCR_ENV]
  else process.env[OCR_ENV] = prevOcr
})

describe('resolveOcrConcurrency', () => {
  it('defaults to 3 on non-low profile', () => {
    const n = resolveOcrConcurrency({
      env: {},
      totalMemBytes: 16 * 1024 ** 3,
      logMutualExclusion: false,
    })
    assert.equal(n, OCR_CONCURRENCY_DEFAULT)
    assert.equal(n, 3)
  })

  it('lowers to 2 when SQLITE mem profile is low', () => {
    const n = resolveOcrConcurrency({
      env: { [MEM_ENV]: 'low' },
      totalMemBytes: 64 * 1024 ** 3,
      logMutualExclusion: false,
    })
    assert.equal(n, OCR_CONCURRENCY_LOW)
    assert.equal(n, 2)
  })

  it('lowers to 2 when totalmem < 6GB and profile unset', () => {
    const n = resolveOcrConcurrency({
      env: {},
      totalMemBytes: 4 * 1024 ** 3,
      logMutualExclusion: false,
    })
    assert.equal(n, OCR_CONCURRENCY_LOW)
  })

  it('OPPTRIX_OCR_CONCURRENCY overrides profile (clamped 1–4)', () => {
    assert.equal(
      resolveOcrConcurrency({
        env: { [OCR_ENV]: '1', [MEM_ENV]: 'high' },
        totalMemBytes: 16 * 1024 ** 3,
        logMutualExclusion: false,
      }),
      1,
    )
    assert.equal(
      resolveOcrConcurrency({
        env: { [OCR_ENV]: '4', [MEM_ENV]: 'low' },
        totalMemBytes: 2 * 1024 ** 3,
        logMutualExclusion: false,
      }),
      OCR_CONCURRENCY_MAX,
    )
    assert.equal(
      resolveOcrConcurrency({
        env: { [OCR_ENV]: '9' },
        totalMemBytes: 16 * 1024 ** 3,
        logMutualExclusion: false,
      }),
      OCR_CONCURRENCY_MAX,
    )
  })

  it('invalid env falls back to profile default', () => {
    assert.equal(
      resolveOcrConcurrency({
        env: { [OCR_ENV]: 'nope' },
        totalMemBytes: 16 * 1024 ** 3,
        logMutualExclusion: false,
      }),
      OCR_CONCURRENCY_DEFAULT,
    )
  })

  it('embeddingReady reduces to 1 and logs once (no unload)', () => {
    const logs = []
    const n = resolveOcrConcurrency({
      env: { [MEM_ENV]: 'high' },
      totalMemBytes: 16 * 1024 ** 3,
      embeddingReady: true,
      log: msg => logs.push(msg),
    })
    assert.equal(n, OCR_CONCURRENCY_WITH_EMBEDDING)
    assert.equal(n, 1)
    assert.equal(logs.length, 1)
    assert.match(logs[0], /OCR concurrency reduced/)
    assert.match(logs[0], /embedding model already loaded/)
    assert.doesNotMatch(logs[0], /token|key|secret|password/i)
  })

  it('embeddingReady still clamps even when env asks for higher', () => {
    const n = resolveOcrConcurrency({
      env: { [OCR_ENV]: '3' },
      embeddingReady: true,
      logMutualExclusion: false,
    })
    assert.equal(n, 1)
  })
})
