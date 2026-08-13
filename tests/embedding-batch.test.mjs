/**
 * TransformersE5Backend.embedPassages 真 batch：mock pipe 收到数组；失败回退逐条；维数=EMBEDDING_DIM
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  TransformersE5Backend,
  MockEmbeddingBackend,
  resolveEmbedBatchSize,
  DEFAULT_EMBED_BATCH_SIZE,
  MIN_EMBED_BATCH_SIZE,
  MAX_EMBED_BATCH_SIZE,
  EMBEDDING_DIM,
} from '../packages/doc-library/dist/index.js'

describe('embedding true batch', () => {
  let prevBatch

  before(() => {
    prevBatch = process.env.OPPTRIX_EMBED_BATCH_SIZE
  })

  after(() => {
    if (prevBatch === undefined) delete process.env.OPPTRIX_EMBED_BATCH_SIZE
    else process.env.OPPTRIX_EMBED_BATCH_SIZE = prevBatch
  })

  it('resolveEmbedBatchSize clamps env to 8–32', () => {
    delete process.env.OPPTRIX_EMBED_BATCH_SIZE
    assert.equal(resolveEmbedBatchSize(), DEFAULT_EMBED_BATCH_SIZE)
    process.env.OPPTRIX_EMBED_BATCH_SIZE = '16'
    assert.equal(resolveEmbedBatchSize(), 16)
    process.env.OPPTRIX_EMBED_BATCH_SIZE = '4'
    assert.equal(resolveEmbedBatchSize(), MIN_EMBED_BATCH_SIZE)
    process.env.OPPTRIX_EMBED_BATCH_SIZE = '64'
    assert.equal(resolveEmbedBatchSize(), MAX_EMBED_BATCH_SIZE)
    process.env.OPPTRIX_EMBED_BATCH_SIZE = 'not-a-number'
    assert.equal(resolveEmbedBatchSize(), DEFAULT_EMBED_BATCH_SIZE)
  })

  it('MockEmbeddingBackend still returns EMBEDDING_DIM per passage', async () => {
    const backend = new MockEmbeddingBackend(true)
    const vecs = await backend.embedPassages(['a', 'b', 'c'])
    assert.equal(vecs.length, 3)
    for (const v of vecs) {
      assert.equal(v.length, EMBEDDING_DIM)
    }
  })

  it('embedPassages passes string[] to pipeline once per batch', async () => {
    process.env.OPPTRIX_EMBED_BATCH_SIZE = '8'
    /** @type {unknown[]} */
    const pipeInputs = []
    const backend = new TransformersE5Backend('/tmp/opptrix-fake-embed')
    backend.ensureLoaded = async () => true
    backend.pipe = async (input) => {
      pipeInputs.push(input)
      const texts = Array.isArray(input) ? input : [input]
      const data = new Float32Array(texts.length * EMBEDDING_DIM)
      for (let i = 0; i < texts.length; i++) {
        data[i * EMBEDDING_DIM] = (i + 1) / 8
      }
      return { data }
    }

    const texts = ['alpha', 'beta', 'gamma']
    const vecs = await backend.embedPassages(texts)
    assert.equal(pipeInputs.length, 1)
    assert.ok(Array.isArray(pipeInputs[0]))
    assert.deepEqual(pipeInputs[0], [
      'passage: alpha',
      'passage: beta',
      'passage: gamma',
    ])
    assert.equal(vecs.length, 3)
    for (const v of vecs) {
      assert.equal(v.length, EMBEDDING_DIM)
    }
    assert.equal(vecs[0][0], 0.125)
    assert.equal(vecs[1][0], 0.25)
    assert.equal(vecs[2][0], 0.375)
  })

  it('embedPassages chunks by OPPTRIX_EMBED_BATCH_SIZE', async () => {
    process.env.OPPTRIX_EMBED_BATCH_SIZE = '8'
    // clamp min is 8; use 10 texts → two pipeline calls (8 + 2)
    /** @type {unknown[]} */
    const pipeInputs = []
    const backend = new TransformersE5Backend('/tmp/opptrix-fake-embed')
    backend.ensureLoaded = async () => true
    backend.pipe = async (input) => {
      pipeInputs.push(input)
      const texts = Array.isArray(input) ? input : [input]
      return { data: new Float32Array(texts.length * EMBEDDING_DIM) }
    }

    const texts = Array.from({ length: 10 }, (_, i) => `t${i}`)
    const vecs = await backend.embedPassages(texts)
    assert.equal(pipeInputs.length, 2)
    assert.ok(Array.isArray(pipeInputs[0]))
    assert.ok(Array.isArray(pipeInputs[1]))
    assert.equal(pipeInputs[0].length, 8)
    assert.equal(pipeInputs[1].length, 2)
    assert.equal(vecs.length, 10)
    assert.ok(vecs.every(v => v.length === EMBEDDING_DIM))
  })

  it('embedPassages falls back to one-by-one when batch pipe fails', async () => {
    process.env.OPPTRIX_EMBED_BATCH_SIZE = '8'
    /** @type {unknown[]} */
    const pipeInputs = []
    const backend = new TransformersE5Backend('/tmp/opptrix-fake-embed')
    backend.ensureLoaded = async () => true
    backend.pipe = async (input) => {
      pipeInputs.push(input)
      if (Array.isArray(input)) {
        throw new Error('batch not supported')
      }
      return { data: new Float32Array(EMBEDDING_DIM) }
    }

    const vecs = await backend.embedPassages(['x', 'y'])
    assert.equal(vecs.length, 2)
    assert.ok(vecs.every(v => v.length === EMBEDDING_DIM))
    assert.equal(pipeInputs.length, 3) // 1 failed batch + 2 singles
    assert.ok(Array.isArray(pipeInputs[0]))
    assert.equal(typeof pipeInputs[1], 'string')
    assert.equal(typeof pipeInputs[2], 'string')
  })
})
