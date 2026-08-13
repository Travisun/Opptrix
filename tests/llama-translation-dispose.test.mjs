/**
 * LlamaRuntime / translation-service：dispose 真正调用 + 空闲卸载配置
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  disposeLlamaHandles,
  llamaRuntime,
} from '../packages/local-inference/dist/index.js'

const require = createRequire(import.meta.url)
const translationService = require('../apps/desktop/electron/translation-service.cjs')

function mockDisposable(label, calls) {
  let disposed = false
  return {
    get disposed() {
      return disposed
    },
    dispose: async (opts) => {
      disposed = true
      calls.push({ label, opts: opts ?? null })
    },
  }
}

describe('disposeLlamaHandles', () => {
  it('calls session → context → model dispose in order', async () => {
    /** @type {Array<{ label: string, opts: unknown }>} */
    const calls = []
    const session = mockDisposable('session', calls)
    const context = mockDisposable('context', calls)
    const model = mockDisposable('model', calls)

    await disposeLlamaHandles({ session, context, model })

    assert.deepEqual(
      calls.map(c => c.label),
      ['session', 'context', 'model'],
    )
    assert.equal(calls[0].opts?.disposeSequence, true)
    assert.equal(session.disposed, true)
    assert.equal(context.disposed, true)
    assert.equal(model.disposed, true)
  })

  it('skips missing handles and already-disposed', async () => {
    /** @type {Array<{ label: string }>} */
    const calls = []
    const already = {
      disposed: true,
      dispose: async () => {
        calls.push({ label: 'should-not-run' })
      },
    }
    await disposeLlamaHandles({ session: null, context: already, model: null })
    assert.equal(calls.length, 0)
  })
})

describe('LlamaRuntime.unload', () => {
  it('invokes dispose on held session/context/model', async () => {
    /** @type {Array<{ label: string, opts: unknown }>} */
    const calls = []
    const session = mockDisposable('session', calls)
    const context = mockDisposable('context', calls)
    const model = mockDisposable('model', calls)

    llamaRuntime.__setHeldForTests({
      session,
      context,
      model,
      modelPath: '/tmp/fake-model.gguf',
    })
    assert.equal(llamaRuntime.__getLoadedPathForTests(), '/tmp/fake-model.gguf')

    await llamaRuntime.unload()

    assert.deepEqual(
      calls.map(c => c.label),
      ['session', 'context', 'model'],
    )
    assert.equal(llamaRuntime.__getLoadedPathForTests(), null)
  })
})

describe('translation-service dispose + idle', () => {
  let prevIdle

  before(() => {
    prevIdle = process.env.OPPTRIX_TRANSLATION_IDLE_MS
  })

  after(async () => {
    if (prevIdle === undefined) delete process.env.OPPTRIX_TRANSLATION_IDLE_MS
    else process.env.OPPTRIX_TRANSLATION_IDLE_MS = prevIdle
    translationService.__setTranslationRuntimeForTests({})
    await translationService.disposeTranslation()
  })

  it('resolveTranslationIdleMs reads env (0 disables)', () => {
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '0'
    assert.equal(translationService.resolveTranslationIdleMs(), 0)
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '1500'
    assert.equal(translationService.resolveTranslationIdleMs(), 1500)
    delete process.env.OPPTRIX_TRANSLATION_IDLE_MS
    assert.equal(
      translationService.resolveTranslationIdleMs(),
      translationService.DEFAULT_TRANSLATION_IDLE_MS,
    )
  })

  it('disposeTranslation calls native dispose and keeps segment LRU size API stable', async () => {
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '0'
    /** @type {Array<{ label: string, opts: unknown }>} */
    const calls = []
    const session = mockDisposable('session', calls)
    const context = mockDisposable('context', calls)
    const model = mockDisposable('model', calls)

    translationService.__setTranslationRuntimeForTests({
      chatSession: session,
      context,
      model,
      loadedModelPath: '/tmp/hy-mt.gguf',
    })

    await translationService.disposeTranslation()

    assert.deepEqual(
      calls.map(c => c.label),
      ['session', 'context', 'model'],
    )
    const state = translationService.__getTranslationRuntimeForTests()
    assert.equal(state.chatSession, null)
    assert.equal(state.model, null)
    assert.equal(state.context, null)
    assert.equal(state.loadedModelPath, null)
    assert.equal(typeof state.segmentMemoryCacheSize, 'number')
  })

  it('idle timer unloads and calls dispose', async () => {
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '40'
    /** @type {Array<{ label: string }>} */
    const calls = []
    const session = mockDisposable('session', calls)
    const context = mockDisposable('context', calls)
    const model = mockDisposable('model', calls)

    translationService.__setTranslationRuntimeForTests({
      chatSession: session,
      context,
      model,
      loadedModelPath: '/tmp/hy-mt.gguf',
    })
    translationService.__touchLastUsedForTests()

    await new Promise(r => setTimeout(r, 120))
    assert.deepEqual(
      calls.map(c => c.label),
      ['session', 'context', 'model'],
    )
    const state = translationService.__getTranslationRuntimeForTests()
    assert.equal(state.loadedModelPath, null)
    assert.equal(state.chatSession, null)
  })
})
