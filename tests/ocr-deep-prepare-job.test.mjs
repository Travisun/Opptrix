import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

async function importJob() {
  return import(path.join(repoRoot, 'packages/doc-library/dist/ocr-deep-prepare-job.js'))
}

const missingStatus = () => ({
  available: false,
  installed: false,
  label: '扫描件识别',
  dir: '',
  modelDir: '',
  workerScript: null,
  hint: '尚未就绪',
  source: 'missing',
})

describe('ocr deep prepare job', () => {
  beforeEach(async () => {
    const mod = await importJob()
    mod.resetOcrDeepPrepareJobForTests()
    mod.setOcrDeepPreparePipelineDepsForTests({
      getStatus: missingStatus,
    })
  })

  afterEach(async () => {
    const mod = await importJob()
    mod.resetOcrDeepPrepareJobForTests()
  })

  it('returns idle snapshot by default', async () => {
    const { getOcrDeepPrepareJobStatus } = await importJob()
    const job = getOcrDeepPrepareJobStatus()
    assert.equal(job.phase, 'idle')
    assert.equal(job.accepted, false)
    assert.equal(job.percent, 0)
    assert.ok(job.message.includes('尚未准备') || job.message.includes('扫描件'))
  })

  it('start returns immediately and status reflects downloading→ready', async () => {
    const {
      startOcrDeepPrepareJob,
      getOcrDeepPrepareJobStatus,
      setOcrDeepPreparePipelineDepsForTests,
    } = await importJob()

    let resolveDownload
    const downloadGate = new Promise(resolve => { resolveDownload = resolve })
    let installed = false

    setOcrDeepPreparePipelineDepsForTests({
      getStatus: () => ({
        available: installed,
        installed,
        label: '扫描件识别',
        dir: '/tmp',
        modelDir: '/tmp',
        workerScript: null,
        hint: installed ? '已就绪' : '尚未就绪',
        source: installed ? 'user' : 'missing',
      }),
      download: async (_dir, opts) => {
        opts?.onProgress?.({
          file: 'ch_PP-OCRv4_det_mobile.onnx',
          receivedBytes: 50,
          totalBytes: 100,
        })
        await downloadGate
        opts?.onProgress?.({
          file: 'ch_PP-OCRv4_det_mobile.onnx',
          receivedBytes: 100,
          totalBytes: 100,
        })
        installed = true
        return { ok: true, missingFiles: [] }
      },
      probeReady: async () => true,
    })

    const t0 = Date.now()
    const first = startOcrDeepPrepareJob()
    const elapsed = Date.now() - t0
    assert.ok(elapsed < 500, `start should return immediately, took ${elapsed}ms`)
    assert.equal(first.started, true)
    assert.equal(first.accepted, true)
    assert.equal(first.phase, 'downloading')

    await new Promise(r => setTimeout(r, 20))
    const mid = getOcrDeepPrepareJobStatus()
    assert.equal(mid.phase, 'downloading')
    assert.ok(mid.percent >= 1)
    assert.ok(mid.message.includes('下载') || mid.message.includes('准备') || mid.message.includes('识别'))
    assert.ok(!/https?:\/\//.test(mid.message))

    resolveDownload()
    await new Promise(r => setTimeout(r, 50))

    const done = getOcrDeepPrepareJobStatus()
    assert.equal(done.phase, 'ready')
    assert.equal(done.percent, 100)
    assert.equal(done.installed, true)
    assert.equal(done.error, null)
  })

  it('concurrent start does not double-run download', async () => {
    const {
      startOcrDeepPrepareJob,
      getOcrDeepPrepareJobStatus,
      setOcrDeepPreparePipelineDepsForTests,
    } = await importJob()

    let resolveDownload
    const downloadGate = new Promise(resolve => { resolveDownload = resolve })
    let downloadCalls = 0
    let installed = false

    setOcrDeepPreparePipelineDepsForTests({
      getStatus: () => ({
        available: installed,
        installed,
        label: '扫描件识别',
        dir: '/tmp',
        modelDir: '/tmp',
        workerScript: null,
        hint: installed ? '已就绪' : '尚未就绪',
        source: installed ? 'user' : 'missing',
      }),
      download: async () => {
        downloadCalls += 1
        await downloadGate
        installed = true
        return { ok: true, missingFiles: [] }
      },
      probeReady: async () => true,
    })

    const a = startOcrDeepPrepareJob()
    const b = startOcrDeepPrepareJob()
    assert.equal(a.phase, getOcrDeepPrepareJobStatus().phase)
    assert.equal(b.phase, getOcrDeepPrepareJobStatus().phase)
    assert.equal(downloadCalls, 1)

    resolveDownload()
    await new Promise(r => setTimeout(r, 40))
    assert.equal(downloadCalls, 1)
    assert.equal(getOcrDeepPrepareJobStatus().phase, 'ready')
  })

  it('maps failures to product-level error without URLs', async () => {
    const {
      startOcrDeepPrepareJob,
      getOcrDeepPrepareJobStatus,
      setOcrDeepPreparePipelineDepsForTests,
      toOcrDeepPrepareUserError,
    } = await importJob()

    assert.match(
      toOcrDeepPrepareUserError(new Error('无法下载 https://hf.co/x 超时')),
      /超时|重试|下载/,
    )
    assert.ok(!toOcrDeepPrepareUserError(new Error('fail https://evil.example/a')).includes('http'))

    setOcrDeepPreparePipelineDepsForTests({
      getStatus: missingStatus,
      download: async () => {
        throw new Error('无法下载识别文件 onnx（https://cdn.example/model）')
      },
      probeReady: async () => false,
    })

    startOcrDeepPrepareJob()
    await new Promise(r => setTimeout(r, 30))

    const job = getOcrDeepPrepareJobStatus()
    assert.equal(job.phase, 'error')
    assert.ok(job.error)
    assert.ok(!/https?:\/\//.test(job.error))
    assert.ok(!/https?:\/\//.test(job.message))
  })
})
