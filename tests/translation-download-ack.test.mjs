/**
 * Electron translation-service：HTTP 代理到 /api/news（无主进程下载 / llama）
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const catalog = require('../apps/desktop/electron/translation-model-catalog.cjs')
const service = require('../apps/desktop/electron/translation-service.cjs')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {typeof globalThis.fetch | undefined} */
let originalFetch = undefined

describe('translation Electron HTTP proxy', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  it('catalog still resolves open-dir path (getDefaultDownloadDir)', () => {
    const dir = catalog.getDefaultDownloadDir()
    assert.ok(typeof dir === 'string' && dir.length > 0)
    assert.match(dir, /llms/)
  })

  it('service.startTranslationModelDownload proxies POST /api/news/translation/download', async () => {
    /** @type {string[]} */
    const urls = []
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      urls.push(url)
      assert.equal(init?.method, 'POST')
      const body = JSON.parse(String(init?.body ?? '{}'))
      assert.equal(body.modelId, 'hy-mt-q4')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          started: true,
          download: {
            modelId: 'hy-mt-q4',
            filename: 'HY-MT1.5-1.8B-Q4_K_M.gguf',
            receivedBytes: 0,
            totalBytes: 100,
            status: 'downloading',
          },
        }),
      }
    }

    const ack = await service.startTranslationModelDownload(repoRoot, 'hy-mt-q4')
    assert.equal(ack.started, true)
    assert.equal(ack.download?.status, 'downloading')
    assert.ok(urls.some(u => /\/api\/news\/translation\/download$/.test(u)))
  })

  it('service.translateArticle prefers SSE and forwards progress', async () => {
    /** @type {unknown[]} */
    const progressEvents = []
    const encoder = new TextEncoder()
    const sseBody = [
      'event: progress\ndata: {"articleId":"a1","phase":"segment","current":1,"total":1,"engine":"offline"}\n\n',
      'event: result\ndata: {"title":"你好","body":"正文","segments":[{"id":"1","text":"段"}],"engine":"offline","fromCache":false}\n\n',
    ].join('')

    globalThis.fetch = async (input, init) => {
      const url = String(input)
      assert.match(url, /\/api\/news\/translate\?stream=1$/)
      assert.equal(init?.method, 'POST')
      assert.equal(init?.headers?.Accept, 'text/event-stream')
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => (String(name).toLowerCase() === 'content-type'
            ? 'text/event-stream; charset=utf-8'
            : null),
        },
        body: {
          getReader() {
            let done = false
            return {
              async read() {
                if (done) return { done: true, value: undefined }
                done = true
                return { done: false, value: encoder.encode(sseBody) }
              },
            }
          },
        },
      }
    }

    const result = await service.translateArticle(repoRoot, {
      articleId: 'a1',
      title: 'Hello',
      bodyText: 'World',
    }, (p) => progressEvents.push(p))

    assert.equal(result.title, '你好')
    assert.equal(result.engine, 'offline')
    assert.equal(progressEvents.length, 1)
    assert.equal(progressEvents[0]?.articleId, 'a1')
  })
})
