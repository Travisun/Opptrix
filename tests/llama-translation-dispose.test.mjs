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

describe('translation-service HTTP proxy (no in-process llama)', () => {
  it('disposeTranslation and bootstrap are no-ops (no GGUF in Electron main)', async () => {
    await assert.doesNotReject(() => translationService.disposeTranslation())
    await assert.doesNotReject(() =>
      translationService.maybeBootstrapOfflineModelDownloads(repoRoot),
    )
    await assert.doesNotReject(() => translationService.preloadTranslationModel(repoRoot))
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

  it('Electron translation-service proxies to /api/news and does not load node-llama', () => {
    const serviceSrc = fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/electron/translation-service.cjs'),
      'utf8',
    )
    assert.match(serviceSrc, /\/api\/news/)
    assert.match(serviceSrc, /\/translation\/status/)
    assert.match(serviceSrc, /\/translate/)
    assert.equal(
      /node-llama-cpp|ensureChatSession|LlamaChatSession/.test(serviceSrc),
      false,
      'must not load llama in Electron main',
    )
  })

  it('ensureTranslationDownloadDir still resolves local open-folder path', async () => {
    const dir = await translationService.ensureTranslationDownloadDir()
    assert.ok(typeof dir === 'string' && dir.length > 0)
    assert.match(dir, /llms/)
  })
})
