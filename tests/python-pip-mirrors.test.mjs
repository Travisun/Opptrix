import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const DAY_MS = 24 * 60 * 60 * 1000

let tmpDataDir = ''
let savedDataDir = process.env.OPPTRIX_DATA_DIR

async function importPipMirrors() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/python/pip-mirrors.js'))
}

function mockFetch(handler) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = handler
  return () => {
    globalThis.fetch = originalFetch
  }
}

describe('pip mirror probing', () => {
  let restoreFetch = () => {}

  beforeEach(async () => {
    tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-pip-cache-'))
    process.env.OPPTRIX_DATA_DIR = tmpDataDir
    const { resetPipMirrorCacheForTests } = await importPipMirrors()
    resetPipMirrorCacheForTests()
  })

  afterEach(async () => {
    restoreFetch()
    if (tmpDataDir) {
      await fs.rm(tmpDataDir, { recursive: true, force: true })
    }
    if (savedDataDir === undefined) {
      delete process.env.OPPTRIX_DATA_DIR
    } else {
      process.env.OPPTRIX_DATA_DIR = savedDataDir
    }
  })

  it('returns empty list for empty input', async () => {
    const { probePipIndexUrls, resolvePreferredPipIndexUrl } = await importPipMirrors()
    assert.deepEqual(await probePipIndexUrls([]), [])
    assert.equal(await resolvePreferredPipIndexUrl([]), undefined)
  })

  it('uses a 90-day cache TTL constant', async () => {
    const { PIP_MIRROR_CACHE_TTL_MS } = await importPipMirrors()
    assert.equal(PIP_MIRROR_CACHE_TTL_MS, 90 * DAY_MS)
  })

  it('sorts reachable mirrors by RTT ascending', async () => {
    const { probePipIndexUrls } = await importPipMirrors()
    const delays = new Map([
      ['https://mirror.slow.example/simple', 80],
      ['https://mirror.fast.example/simple', 10],
      ['https://mirror.mid.example/simple', 40],
    ])

    restoreFetch = mockFetch(async (input, init) => {
      const url = String(input)
      const delay = delays.get(url.replace(/\/$/, '')) ?? 5
      await new Promise(resolve => setTimeout(resolve, delay))
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 })
      }
      return new Response('ok', { status: 200 })
    })

    const sorted = await probePipIndexUrls([
      'https://mirror.slow.example/simple',
      'https://mirror.fast.example/simple',
      'https://mirror.mid.example/simple',
    ])

    assert.deepEqual(sorted, [
      'https://mirror.fast.example/simple',
      'https://mirror.mid.example/simple',
      'https://mirror.slow.example/simple',
    ])
  })

  it('keeps original order when all probes fail', async () => {
    const { probePipIndexUrls } = await importPipMirrors()
    const urls = [
      'https://mirror.a.example/simple',
      'https://mirror.b.example/simple',
    ]

    restoreFetch = mockFetch(async () => {
      throw new Error('network down')
    })

    assert.deepEqual(await probePipIndexUrls(urls), urls)
  })

  it('places failed mirrors after successful ones', async () => {
    const { probePipIndexUrls } = await importPipMirrors()

    restoreFetch = mockFetch(async (input, init) => {
      const url = String(input)
      if (url.includes('bad.example')) {
        return new Response(null, { status: 503 })
      }
      await new Promise(resolve => setTimeout(resolve, url.includes('fast.example') ? 5 : 30))
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 })
      }
      return new Response('ok', { status: 200 })
    })

    const sorted = await probePipIndexUrls([
      'https://mirror.bad.example/simple',
      'https://mirror.slow.example/simple',
      'https://mirror.fast.example/simple',
    ])

    assert.deepEqual(sorted, [
      'https://mirror.fast.example/simple',
      'https://mirror.slow.example/simple',
      'https://mirror.bad.example/simple',
    ])
  })

  it('probes simple URLs without duplicating /simple', async () => {
    const { probePipIndexUrls } = await importPipMirrors()
    const probed = []

    restoreFetch = mockFetch(async (input) => {
      probed.push(String(input))
      return new Response(null, { status: 200 })
    })

    await probePipIndexUrls([
      'https://pypi.example/simple',
      'https://mirror.example/simple',
    ])
    assert.deepEqual(probed, [
      'https://pypi.example/simple/',
      'https://mirror.example/simple/',
    ])
  })

  it('caches preferred mirror and sync getter reads it', async () => {
    const {
      resolvePreferredPipIndexUrl,
      getPreferredPipIndexUrlSync,
      resetPipMirrorCacheForTests,
    } = await importPipMirrors()

    let fetchCount = 0
    restoreFetch = mockFetch(async (input) => {
      fetchCount += 1
      const url = String(input)
      await new Promise(resolve => setTimeout(resolve, url.includes('fast.example') ? 5 : 40))
      return new Response(null, { status: 200 })
    })

    const urls = [
      'https://mirror.slow.example/simple',
      'https://mirror.fast.example/simple',
    ]

    const preferred = await resolvePreferredPipIndexUrl(urls)
    assert.equal(preferred, 'https://mirror.fast.example/simple')
    assert.equal(getPreferredPipIndexUrlSync(urls), 'https://mirror.fast.example/simple')

    const firstFetchCount = fetchCount
    const cached = await resolvePreferredPipIndexUrl(urls)
    assert.equal(cached, 'https://mirror.fast.example/simple')
    assert.equal(fetchCount, firstFetchCount)

    resetPipMirrorCacheForTests()
    assert.equal(getPreferredPipIndexUrlSync(urls), urls[0])
  })

  it('persists cache to disk and hydrates after simulated process restart', async () => {
    const {
      resolvePreferredPipIndexUrl,
      getPreferredPipIndexUrlSync,
      readPipMirrorCacheFileForTests,
      resetPipMirrorCacheForTests,
      PIP_MIRROR_CACHE_TTL_MS,
    } = await importPipMirrors()

    let fetchCount = 0
    restoreFetch = mockFetch(async (input) => {
      fetchCount += 1
      const url = String(input)
      await new Promise(resolve => setTimeout(resolve, url.includes('fast.example') ? 5 : 40))
      return new Response(null, { status: 200 })
    })

    const urls = [
      'https://mirror.slow.example/simple',
      'https://mirror.fast.example/simple',
    ]

    await resolvePreferredPipIndexUrl(urls)
    assert.equal(fetchCount, 2)

    const onDisk = await readPipMirrorCacheFileForTests()
    assert.ok(onDisk)
    assert.equal(onDisk.urlsKey, urls.join('\0'))
    assert.equal(onDisk.sortedUrls[0], 'https://mirror.fast.example/simple')
    assert.ok(onDisk.expiresAt > Date.now() + PIP_MIRROR_CACHE_TTL_MS - 60_000)

    const cacheFilePath = path.join(tmpDataDir, 'runtimes', 'python', 'pip-mirrors-cache.json')
    const persisted = await fs.readFile(cacheFilePath, 'utf8')
    resetPipMirrorCacheForTests()
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true })
    await fs.writeFile(cacheFilePath, persisted, 'utf8')

    assert.equal(getPreferredPipIndexUrlSync(urls), 'https://mirror.fast.example/simple')

    const cachedAgain = await resolvePreferredPipIndexUrl(urls)
    assert.equal(cachedAgain, 'https://mirror.fast.example/simple')
    assert.equal(fetchCount, 2)
  })

  it('invalidate clears cache and forces re-probe', async () => {
    const {
      resolvePreferredPipIndexUrl,
      invalidatePipMirrorCache,
      readPipMirrorCacheFileForTests,
    } = await importPipMirrors()

    let fetchCount = 0
    restoreFetch = mockFetch(async () => {
      fetchCount += 1
      return new Response(null, { status: 200 })
    })

    const urls = [
      'https://mirror.a.example/simple',
      'https://mirror.b.example/simple',
    ]

    await resolvePreferredPipIndexUrl(urls)
    assert.equal(fetchCount, 2)

    invalidatePipMirrorCache()
    assert.equal(await readPipMirrorCacheFileForTests(), null)

    await resolvePreferredPipIndexUrl(urls)
    assert.equal(fetchCount, 4)
  })

  it('rotatePreferredPipMirror moves current preferred to the end', async () => {
    const {
      resolvePreferredPipIndexUrl,
      rotatePreferredPipMirror,
      getPreferredPipIndexUrlSync,
      getSortedPipIndexUrlsSync,
    } = await importPipMirrors()

    restoreFetch = mockFetch(async (input) => {
      const url = String(input)
      await new Promise(resolve => setTimeout(resolve, url.includes('b.example') ? 5 : 40))
      return new Response(null, { status: 200 })
    })

    const urls = [
      'https://mirror.a.example/simple',
      'https://mirror.b.example/simple',
    ]

    await resolvePreferredPipIndexUrl(urls)
    assert.equal(getPreferredPipIndexUrlSync(urls), 'https://mirror.b.example/simple')
    rotatePreferredPipMirror(urls)

    assert.equal(getPreferredPipIndexUrlSync(urls), 'https://mirror.a.example/simple')
    assert.deepEqual(getSortedPipIndexUrlsSync(urls), [
      'https://mirror.a.example/simple',
      'https://mirror.b.example/simple',
    ])
  })

  it('detects pip mirror network failures from stderr-like messages', async () => {
    const { isPipMirrorNetworkFailure } = await importPipMirrors()
    assert.equal(isPipMirrorNetworkFailure('Read timed out'), true)
    assert.equal(isPipMirrorNetworkFailure('Could not find a version that satisfies the requirement'), true)
    assert.equal(isPipMirrorNetworkFailure('SyntaxError: invalid syntax'), false)
  })

  it('sync getter falls back to first url before cache is warmed', async () => {
    const { getPreferredPipIndexUrlSync } = await importPipMirrors()
    const urls = [
      'https://mirror.primary.example/simple',
      'https://mirror.secondary.example/simple',
    ]
    assert.equal(getPreferredPipIndexUrlSync(urls), urls[0])
  })
})
