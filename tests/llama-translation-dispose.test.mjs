/**
 * LlamaRuntime / translation-service：dispose 真正调用 + 空闲卸载 + 按需加载语义
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  disposeLlamaHandles,
  llamaRuntime,
  resolveTranslationIdleMs as resolveLlamaIdleMs,
  DEFAULT_TRANSLATION_IDLE_MS as LLAMA_DEFAULT_IDLE_MS,
} from '../packages/local-inference/dist/index.js'

const require = createRequire(import.meta.url)
const translationService = require('../apps/desktop/electron/translation-service.cjs')
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

describe('LlamaRuntime idle unload', () => {
  let prevIdle

  before(() => {
    prevIdle = process.env.OPPTRIX_TRANSLATION_IDLE_MS
  })

  after(async () => {
    if (prevIdle === undefined) delete process.env.OPPTRIX_TRANSLATION_IDLE_MS
    else process.env.OPPTRIX_TRANSLATION_IDLE_MS = prevIdle
    await llamaRuntime.unload()
  })

  it('resolveTranslationIdleMs mirrors Electron env semantics', () => {
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '0'
    assert.equal(resolveLlamaIdleMs(), 0)
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '1500'
    assert.equal(resolveLlamaIdleMs(), 1500)
    delete process.env.OPPTRIX_TRANSLATION_IDLE_MS
    assert.equal(resolveLlamaIdleMs(), LLAMA_DEFAULT_IDLE_MS)
  })

  it('idle timer unloads and calls dispose', async () => {
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '40'
    /** @type {Array<{ label: string }>} */
    const calls = []
    const session = mockDisposable('session', calls)
    const context = mockDisposable('context', calls)
    const model = mockDisposable('model', calls)

    llamaRuntime.__setHeldForTests({
      session,
      context,
      model,
      modelPath: '/tmp/hy-mt.gguf',
    })
    llamaRuntime.__touchLastUsedForTests()

    await new Promise(r => setTimeout(r, 120))
    assert.deepEqual(
      calls.map(c => c.label),
      ['session', 'context', 'model'],
    )
    assert.equal(llamaRuntime.__getLoadedPathForTests(), null)
  })
})

describe('translation-service dispose + idle + on-demand', () => {
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

  it('status ready=false when unloaded (avoids false ready UI)', async () => {
    process.env.OPPTRIX_TRANSLATION_IDLE_MS = '0'
    translationService.__setTranslationRuntimeForTests({})
    const status = await translationService.getTranslationStatus(repoRoot, {
      translation: { service_mode: 'offline', offline_model: '__auto__' },
    })
    assert.equal(status.ready, false)
    assert.equal(status.loading, false)
    // modelFound 仅表示磁盘有文件；未 load 时不得把 ready 置 true
    if (status.modelFound) {
      assert.equal(status.ready, false)
    }
  })

  it('boot path does not auto-preload translation model', () => {
    const mainSrc = fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/electron/main.cjs'),
      'utf8',
    )
    const match = mainSrc.match(
      /async function continueDesktopBootstrap\([\s\S]*?\n  \}/,
    )
    assert.ok(match, 'continueDesktopBootstrap not found')
    assert.equal(
      /preloadTranslationModel/.test(match[0]),
      false,
      'bootstrap must not call preloadTranslationModel',
    )
  })

  it('download success path source does not auto-preload', () => {
    const serviceSrc = fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/electron/translation-service.cjs'),
      'utf8',
    )
    const downloadSrc = fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/electron/translation-download.cjs'),
      'utf8',
    )
    // IPC 入口已改为同步 ack（startTranslationModelDownload → startTranslationModelDownloadAck）
    const serviceMatch = serviceSrc.match(
      /function startTranslationModelDownload\([\s\S]*?\n\}/,
    )
    assert.ok(serviceMatch, 'startTranslationModelDownload not found')
    assert.equal(
      /preloadTranslationModel/.test(serviceMatch[0]),
      false,
      'download IPC entry must not auto-preload',
    )
    const ackMatch = downloadSrc.match(
      /function startTranslationModelDownloadAck\([\s\S]*?\n\}/,
    )
    assert.ok(ackMatch, 'startTranslationModelDownloadAck not found')
    assert.equal(
      /preloadTranslationModel/.test(ackMatch[0]),
      false,
      'download ack path must not auto-preload',
    )
    assert.equal(
      /preloadTranslationModel/.test(downloadSrc),
      false,
      'translation-download must not reference preloadTranslationModel',
    )
  })

  it('translateArticleLocal emits loading phase before ensure when cold', async () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/electron/translation-service.cjs'),
      'utf8',
    )
    assert.match(src, /phase:\s*'loading'/)
    assert.match(src, /async function translateArticleLocal/)
    assert.match(
      src,
      /translateArticleLocal[\s\S]*ensureChatSession/,
    )
  })
})
