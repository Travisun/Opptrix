/**
 * Embedding 空闲卸载 + closeDocLibrary 联动 embedding 关闭 + 按需加载
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  EmbeddingService,
  MockEmbeddingBackend,
  TransformersE5Backend,
  getEmbeddingService,
  closeEmbeddingService,
  setEmbeddingServiceForTests,
  closeDocLibraryService,
  resetEmbedPendingAfterEnableForTests,
  resolveEmbedIdleMs,
  DEFAULT_EMBED_IDLE_MS,
} from '../packages/doc-library/dist/index.js'

describe('embedding idle unload', () => {
  let prevIdle
  let prevSkipPending

  before(() => {
    prevIdle = process.env.OPPTRIX_EMBED_IDLE_MS
    prevSkipPending = process.env.OPPTRIX_EMBED_SKIP_PENDING_BACKFILL
    process.env.OPPTRIX_EMBED_SKIP_PENDING_BACKFILL = '1'
  })

  after(async () => {
    if (prevIdle === undefined) delete process.env.OPPTRIX_EMBED_IDLE_MS
    else process.env.OPPTRIX_EMBED_IDLE_MS = prevIdle
    if (prevSkipPending === undefined) delete process.env.OPPTRIX_EMBED_SKIP_PENDING_BACKFILL
    else process.env.OPPTRIX_EMBED_SKIP_PENDING_BACKFILL = prevSkipPending
    resetEmbedPendingAfterEnableForTests()
    await closeEmbeddingService()
    setEmbeddingServiceForTests(null)
  })

  it('resolveEmbedIdleMs reads env (0 disables)', () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '0'
    assert.equal(resolveEmbedIdleMs(), 0)
    process.env.OPPTRIX_EMBED_IDLE_MS = '1500'
    assert.equal(resolveEmbedIdleMs(), 1500)
    delete process.env.OPPTRIX_EMBED_IDLE_MS
    assert.equal(resolveEmbedIdleMs(), DEFAULT_EMBED_IDLE_MS)
  })

  it('releaseLoadedModel disposes backend and allows re-embed after re-enable', async () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '0'
    let disposeCount = 0
    const backend = new MockEmbeddingBackend(true)
    const origDispose = backend.dispose.bind(backend)
    backend.dispose = async () => {
      disposeCount += 1
      return origDispose()
    }
    const svc = new EmbeddingService(backend)
    const v1 = await svc.embedQuery('hello')
    assert.ok(Array.isArray(v1) && v1.length > 0)
    assert.equal(svc.isReady(), true)

    await svc.releaseLoadedModel()
    assert.equal(disposeCount, 1)
    assert.equal(svc.getBackend(), null)
    assert.equal(svc.isReady(), false)

    // 注入后端模拟 tryEnable / 再次加载成功（无本机模型时）
    svc.setBackend(new MockEmbeddingBackend(true))
    const v2 = await svc.embedQuery('again')
    assert.ok(Array.isArray(v2) && v2.length > 0)
    assert.equal(svc.isReady(), true)
  })

  it('idle timer unloads then embed succeeds after setBackend', async () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '40'
    let disposeCount = 0
    const backend = new MockEmbeddingBackend(true)
    const origDispose = backend.dispose.bind(backend)
    backend.dispose = async () => {
      disposeCount += 1
      return origDispose()
    }
    const svc = new EmbeddingService(backend)
    await svc.embedQuery('tick')
    assert.equal(svc.isReady(), true)

    await new Promise(r => setTimeout(r, 100))
    assert.equal(disposeCount, 1)
    assert.equal(svc.getBackend(), null)
    assert.equal(svc.isReady(), false)

    svc.setBackend(new MockEmbeddingBackend(true))
    const v = await svc.embedQuery('after-idle')
    assert.ok(v && v.length > 0)
  })

  it('injected not-ready Mock still blocks tryEnableDefaultBackend', async () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '0'
    const svc = new EmbeddingService(new MockEmbeddingBackend(false))
    assert.equal(await svc.tryEnableDefaultBackend(), false)
    assert.equal(svc.getBackend()?.isReady(), false)
  })

  it('TransformersE5Backend not-ready still allows tryEnable to call ensureLoaded', async () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '0'
    resetEmbedPendingAfterEnableForTests()
    let ensureCalls = 0
    let ready = false
    /** @type {import('../packages/doc-library/dist/index.js').EmbeddingBackend} */
    const backend = Object.create(TransformersE5Backend.prototype)
    backend.dimensions = 384
    backend.isReady = () => ready
    backend.ensureLoaded = async () => {
      ensureCalls += 1
      ready = true
      return true
    }
    backend.embedQuery = async () => {
      await backend.ensureLoaded()
      return new Array(384).fill(0.01)
    }
    backend.dispose = async () => {
      ready = false
    }

    const svc = new EmbeddingService(backend)
    assert.equal(svc.isReady(), false)
    // 旧逻辑：if (this.backend) return false → 卡住；现应再 ensureLoaded
    assert.equal(await svc.tryEnableDefaultBackend(), true)
    assert.equal(ensureCalls, 1)
    assert.equal(svc.isReady(), true)

    await backend.dispose()
    assert.equal(svc.isReady(), false)
    assert.equal(await svc.tryEnableDefaultBackend(), true)
    assert.equal(ensureCalls, 2)
  })

  it('embedQuery triggers on-demand tryEnable / load when not ready', async () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '0'
    resetEmbedPendingAfterEnableForTests()
    let ensureCalls = 0
    let ready = false
    /** @type {import('../packages/doc-library/dist/index.js').EmbeddingBackend} */
    const backend = Object.create(TransformersE5Backend.prototype)
    backend.dimensions = 384
    backend.isReady = () => ready
    backend.ensureLoaded = async () => {
      ensureCalls += 1
      ready = true
      return true
    }
    backend.embedQuery = async () => {
      if (!ready) await backend.ensureLoaded()
      return new Array(384).fill(0.02)
    }
    backend.embedPassages = async (texts) => texts.map(() => new Array(384).fill(0.02))
    backend.dispose = async () => {
      ready = false
    }

    const svc = new EmbeddingService(backend)
    assert.equal(svc.isReady(), false)
    const vec = await svc.embedQuery('semantic query')
    assert.ok(vec && vec.length === 384)
    assert.ok(ensureCalls >= 1, 'embedQuery must on-demand load')
    assert.equal(svc.isReady(), true)
  })

  it('TransformersE5Backend.dispose invokes pipeline.dispose when present', async () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '0'
    let pipeDispose = 0
    const backend = new TransformersE5Backend('/tmp/opptrix-no-such-e5-model')
    // 注入假 pipe（绕过 ensureLoaded）；pipe 为 private，经 any 写入测 dispose
    /** @type {{ pipe: unknown }} */
    const mutable = /** @type {any} */ (backend)
    mutable.pipe = {
      dispose: async () => {
        pipeDispose += 1
      },
    }
    await backend.dispose()
    assert.equal(pipeDispose, 1)
    assert.equal(mutable.pipe, null)
  })

  it('closeDocLibraryService closes shared embedding', async () => {
    process.env.OPPTRIX_EMBED_IDLE_MS = '0'
    let disposeCount = 0
    const backend = new MockEmbeddingBackend(true)
    const origDispose = backend.dispose.bind(backend)
    backend.dispose = async () => {
      disposeCount += 1
      return origDispose()
    }
    const emb = new EmbeddingService(backend)
    setEmbeddingServiceForTests(emb)
    assert.equal(getEmbeddingService(), emb)

    await closeDocLibraryService()
    assert.equal(disposeCount, 1)
    // 单例已清空，再次 get 得到新实例
    assert.notEqual(getEmbeddingService(), emb)
    setEmbeddingServiceForTests(null)
    await closeEmbeddingService()
  })
})
