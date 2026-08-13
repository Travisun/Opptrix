/**
 * translation-start-download：立即 ack + 后台下载；并发不双开
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { ReadableStream } from 'node:stream/web'

const require = createRequire(import.meta.url)
const downloadMod = require('../apps/desktop/electron/translation-download.cjs')
const catalog = require('../apps/desktop/electron/translation-model-catalog.cjs')
const service = require('../apps/desktop/electron/translation-service.cjs')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {string | null} */
let tmpLlmsDir = null
/** @type {typeof globalThis.fetch | undefined} */
let originalFetch = undefined

function makeSlowBody(chunks, delayMs) {
  let i = 0
  return new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      await new Promise(r => setTimeout(r, delayMs))
      controller.enqueue(chunks[i])
      i += 1
    },
  })
}

describe('translation GGUF download ack', () => {
  beforeEach(() => {
    downloadMod.__resetDownloadStateForTests()
    tmpLlmsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tr-dl-'))
    process.env.OPPTRIX_LLM_DIR = tmpLlmsDir
    // getDefaultDownloadDir uses ~/.opptrix/llms — redirect via home override is hard;
    // instead write into default dir only if we mock catalog. Use symlink-free approach:
    // patch by setting HOME to tmp parent so getDefaultDownloadDir lands under tmp.
    originalFetch = globalThis.fetch
  })

  afterEach(async () => {
    downloadMod.__resetDownloadStateForTests()
    if (originalFetch) globalThis.fetch = originalFetch
    delete process.env.OPPTRIX_LLM_DIR
    if (tmpLlmsDir) {
      fs.rmSync(tmpLlmsDir, { recursive: true, force: true })
      tmpLlmsDir = null
    }
  })

  it('startTranslationModelDownloadAck returns immediately while download continues', async () => {
    const model = catalog.getCatalogModel('hy-mt-q4')
    assert.ok(model)

    // Redirect download dir: monkey-patch by writing into real default would pollute home.
    // Use OPPTRIX via re-require? getDefaultDownloadDir ignores OPPTRIX_LLM_DIR.
    // Create a fake fetch + run with home override.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-home-'))
    const prevHome = process.env.HOME
    process.env.HOME = home
    const llmsDir = path.join(home, '.opptrix', 'llms')
    fs.mkdirSync(llmsDir, { recursive: true })

    try {
      const payload = Buffer.from('gguf-fake-bytes-for-test')
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        headers: {
          get: (name) => (name.toLowerCase() === 'content-length' ? String(payload.length) : null),
        },
        body: makeSlowBody([payload.subarray(0, 8), payload.subarray(8)], 80),
      })

      /** @type {object[]} */
      const progressEvents = []
      const t0 = Date.now()
      const ack = downloadMod.startTranslationModelDownloadAck('hy-mt-q4', p => {
        progressEvents.push({ ...p })
      })
      const elapsed = Date.now() - t0

      assert.equal(ack.started, true)
      assert.equal(ack.download?.status, 'downloading')
      assert.equal(ack.download?.modelId, 'hy-mt-q4')
      assert.ok(elapsed < 200, `ack should be immediate, took ${elapsed}ms`)
      assert.equal(downloadMod.isDownloadActive(), true)

      const concurrent = downloadMod.startTranslationModelDownloadAck('hy-mt-q8')
      assert.equal(concurrent.started, false)
      assert.equal(concurrent.download?.modelId, 'hy-mt-q4')

      const job = downloadMod.__getActiveDownloadPromiseForTests()
      assert.ok(job)
      await job

      assert.equal(downloadMod.isDownloadActive(), false)
      assert.ok(progressEvents.some(e => e.status === 'completed' || e.receivedBytes > 0))
      assert.ok(fs.existsSync(path.join(llmsDir, model.filename)))
    } finally {
      process.env.HOME = prevHome
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('service.startTranslationModelDownload is sync ack (not awaiting full download)', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-home-'))
    const prevHome = process.env.HOME
    process.env.HOME = home
    fs.mkdirSync(path.join(home, '.opptrix', 'llms'), { recursive: true })

    try {
      const payload = Buffer.from('service-ack-bytes')
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        headers: {
          get: (name) => (name.toLowerCase() === 'content-length' ? String(payload.length) : null),
        },
        body: makeSlowBody([payload], 120),
      })

      const t0 = Date.now()
      const ack = service.startTranslationModelDownload(repoRoot, 'hy-mt-q4')
      const elapsed = Date.now() - t0
      assert.equal(ack.started, true)
      assert.ok(elapsed < 200)
      assert.equal(typeof ack.then, 'undefined', 'must not return a Promise')

      const job = downloadMod.__getActiveDownloadPromiseForTests()
      await job
    } finally {
      downloadMod.__resetDownloadStateForTests()
      process.env.HOME = prevHome
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('already-present file returns completed ack without hanging', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-home-'))
    const prevHome = process.env.HOME
    process.env.HOME = home
    const model = catalog.getCatalogModel('hy-mt-q4')
    assert.ok(model)
    const llmsDir = path.join(home, '.opptrix', 'llms')
    fs.mkdirSync(llmsDir, { recursive: true })
    fs.writeFileSync(path.join(llmsDir, model.filename), 'x')

    try {
      const ack = downloadMod.startTranslationModelDownloadAck('hy-mt-q4')
      assert.equal(ack.started, true)
      assert.equal(ack.alreadyPresent, true)
      assert.equal(ack.download?.status, 'completed')
      assert.equal(downloadMod.isDownloadActive(), false)
    } finally {
      process.env.HOME = prevHome
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
