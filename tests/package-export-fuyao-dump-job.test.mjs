import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

const repoRoot = join(import.meta.dirname, '..')

describe('package export job', () => {
  /** @type {string} */
  let dataDir = ''

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'opmd-export-job-'))
    process.env.OPPTRIX_DATA_DIR = dataDir
    process.env.OPPTRIX_MARKET_DB_PATH = join(dataDir, 'market.db')
    // 禁止 boot warm / 迁移抢跑 duck-cli worker，避免测试结束仍 unhandledRejection
    process.env.OPPTRIX_DUCK_WARM_ON_BOOT = '0'
  })

  after(async () => {
    const {
      awaitPackageExportJobsForTests,
      resetPackageExportJobsForTests,
      setPackageExportRunnerForTests,
    } = await import(join(repoRoot, 'packages/market-data/dist/package-export-job.js'))
    await awaitPackageExportJobsForTests()
    setPackageExportRunnerForTests(null)
    resetPackageExportJobsForTests()
    try {
      const { resetMarketDataRuntime } = await import(
        join(repoRoot, 'packages/market-data/dist/runtime.js')
      )
      resetMarketDataRuntime()
    } catch { /* ignore */ }
    try {
      const { resetDuckCliPools } = await import(
        join(repoRoot, 'packages/market-data/dist/duck/duck-cli-pool.js')
      )
      await resetDuckCliPools()
    } catch { /* ignore */ }
    if (dataDir) await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('start → poll → ready with downloadable file', async () => {
    const {
      startPackageExportJob,
      getPackageExportJob,
      getPackageExportJobFilePath,
      resetPackageExportJobsForTests,
      setPackageExportRunnerForTests,
      awaitPackageExportJobsForTests,
    } = await import(join(repoRoot, 'packages/market-data/dist/package-export-job.js'))
    resetPackageExportJobsForTests()

    // stub 导出：隔离 duck-cli，只验 job 编排（queued→running→ready + 可下载文件）
    setPackageExportRunnerForTests(async () => Buffer.from('opmd-test-package-payload'))

    const started = startPackageExportJob()
    assert.ok(started.job_id)
    assert.equal(started.status === 'queued' || started.status === 'running', true)

    const deadline = Date.now() + 60_000
    let snap = started
    while (snap.status === 'queued' || snap.status === 'running') {
      assert.ok(Date.now() < deadline, 'export job timed out')
      await new Promise(r => setTimeout(r, 20))
      const next = getPackageExportJob(snap.job_id)
      assert.ok(next)
      snap = next
    }

    await awaitPackageExportJobsForTests()

    assert.equal(snap.status, 'ready')
    assert.ok(snap.filename?.endsWith('.opmd'))
    assert.ok((snap.bytes ?? 0) > 0)
    assert.match(snap.download_path ?? '', /\/api\/market-data\/export\/jobs\/.+\/download/)

    const file = getPackageExportJobFilePath(snap.job_id)
    assert.ok(file)
    assert.ok(file.bytes > 0)

    setPackageExportRunnerForTests(null)
  })

  it('rejects invalid pack id on start', async () => {
    const { startPackageExportJob, resetPackageExportJobsForTests } = await import(
      join(repoRoot, 'packages/market-data/dist/package-export-job.js')
    )
    resetPackageExportJobsForTests()
    assert.throws(() => startPackageExportJob({ pack: 'nope' }), /无效的市场包/)
  })
})

describe('fuyao dump job', () => {
  /** @type {string} */
  let dataDir = ''

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'fuyao-dump-job-'))
    process.env.OPPTRIX_DATA_DIR = dataDir
  })

  after(async () => {
    const { resetFuyaoDumpJobsForTests } = await import(
      join(repoRoot, 'packages/market-data/dist/sync/fuyao-dump-job.js')
    )
    resetFuyaoDumpJobsForTests()
    if (dataDir) await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  it('cache hit returns ready synchronously; cold path returns preparing then ready', async () => {
    const {
      prepareFuyaoDumpMaybeAsync,
      getFuyaoDumpJob,
      resetFuyaoDumpJobsForTests,
      isFuyaoDumpLocalCacheReady,
    } = await import(join(repoRoot, 'packages/market-data/dist/sync/fuyao-dump-job.js'))
    const { parquetCachePath } = await import(
      join(repoRoot, 'packages/market-data/dist/sync/dump-import.js')
    )
    resetFuyaoDumpJobsForTests()

    const destDir = join(dataDir, 'dumps')
    await mkdir(destDir, { recursive: true })

    // Seed market cache so local_path is a sync ready path
    const cachePath = parquetCachePath('incremental')
    await mkdir(join(cachePath, '..'), { recursive: true })
    await writeFile(cachePath, Buffer.alloc(8192, 1))
    assert.equal(isFuyaoDumpLocalCacheReady('incremental', destDir, false), true)

    const ready = await prepareFuyaoDumpMaybeAsync({
      dumpKind: 'incremental',
      mode: 'local_path',
      destDir,
      get: async () => {
        throw new Error('should not fetch when cache hit')
      },
    })
    assert.equal(ready.status, 'ready')
    assert.equal(ready.ok, true)
    assert.equal(ready.from_cache, true)
    assert.ok(ready.path)

    // Force cold path → preparing job
    let fetchCalls = 0
    const cold = await prepareFuyaoDumpMaybeAsync({
      dumpKind: 'incremental',
      mode: 'local_path',
      forceRefresh: true,
      destDir,
      get: async () => {
        fetchCalls += 1
        return { presigned_url: 'https://example.invalid/dump.parquet' }
      },
    })
    assert.equal(cold.status, 'preparing')
    assert.ok(cold.job_id)
    assert.match(cold.poll_hint ?? '', /job_id/)

    // Poll while "downloading" — fetch will fail; job should fail (not hang forever)
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('network blocked in test')
    }
    try {
      const deadline = Date.now() + 10_000
      let polled = getFuyaoDumpJob(cold.job_id)
      assert.ok(polled)
      while (polled.status === 'preparing') {
        assert.ok(Date.now() < deadline, 'dump job timed out')
        await new Promise(r => setTimeout(r, 50))
        polled = getFuyaoDumpJob(cold.job_id)
        assert.ok(polled)
      }
      assert.equal(polled.status, 'failed')
      assert.equal(polled.ok, false)
      assert.ok(fetchCalls >= 1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('presigned_url mode stays sync ready', async () => {
    const { prepareFuyaoDumpMaybeAsync, resetFuyaoDumpJobsForTests } = await import(
      join(repoRoot, 'packages/market-data/dist/sync/fuyao-dump-job.js')
    )
    resetFuyaoDumpJobsForTests()
    const result = await prepareFuyaoDumpMaybeAsync({
      dumpKind: 'full',
      mode: 'presigned_url',
      destDir: join(dataDir, 'dumps2'),
      get: async () => ({ download_url: 'https://cdn.example/full.parquet' }),
    })
    assert.equal(result.status, 'ready')
    assert.equal(result.ok, true)
    assert.equal(result.url, 'https://cdn.example/full.parquet')
  })
})
