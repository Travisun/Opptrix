import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

async function importJob() {
  return import(path.join(repoRoot, 'packages/doc-library/dist/semantic-model-install-job.js'))
}

const missingStatus = () => ({
  installed: false,
  label: '语义检索模型',
  dir: '',
  missingFiles: ['config.json'],
  source: 'missing',
})

describe('semantic model install job', () => {
  beforeEach(async () => {
    const mod = await importJob()
    mod.resetSemanticModelInstallJobForTests()
    mod.setSemanticModelInstallPipelineDepsForTests({
      getStatus: missingStatus,
    })
  })

  afterEach(async () => {
    const mod = await importJob()
    mod.resetSemanticModelInstallJobForTests()
  })

  it('returns idle snapshot by default', async () => {
    const { getSemanticModelInstallJobStatus } = await importJob()
    const job = getSemanticModelInstallJobStatus()
    assert.equal(job.phase, 'idle')
    assert.equal(job.accepted, false)
    assert.equal(job.percent, 0)
    assert.ok(job.message.includes('尚未安装') || job.message.includes('语义检索'))
  })

  it('start returns immediately and status reflects downloading→ready', async () => {
    const {
      startSemanticModelInstallJob,
      getSemanticModelInstallJobStatus,
      setSemanticModelInstallPipelineDepsForTests,
    } = await importJob()

    let resolveDownload
    const downloadGate = new Promise(resolve => { resolveDownload = resolve })
    let installed = false

    setSemanticModelInstallPipelineDepsForTests({
      getStatus: () => ({
        installed,
        label: '语义检索模型',
        dir: '/tmp',
        missingFiles: installed ? [] : ['config.json'],
        source: installed ? 'user' : 'missing',
      }),
      download: async ({ onProgress }) => {
        onProgress?.({
          file: 'config.json',
          receivedBytes: 50,
          totalBytes: 100,
          sourceLabel: 'mock',
        })
        await downloadGate
        onProgress?.({
          file: 'config.json',
          receivedBytes: 100,
          totalBytes: 100,
          sourceLabel: 'mock',
        })
        installed = true
        return {
          installed: true,
          dir: '/tmp',
          missingFiles: [],
          source: 'user',
        }
      },
      tryEnable: async () => true,
    })

    const t0 = Date.now()
    const first = startSemanticModelInstallJob()
    const elapsed = Date.now() - t0
    assert.ok(elapsed < 500, `start should return immediately, took ${elapsed}ms`)
    assert.equal(first.started, true)
    assert.equal(first.accepted, true)
    assert.ok(first.phase === 'downloading' || first.phase === 'enabling')

    await new Promise(r => setTimeout(r, 20))
    const mid = getSemanticModelInstallJobStatus()
    assert.equal(mid.phase, 'downloading')
    assert.ok(mid.percent >= 1)
    assert.ok(mid.message.includes('下载') || mid.message.includes('语义检索'))
    assert.ok(!/https?:\/\//.test(mid.message))

    resolveDownload()
    await new Promise(r => setTimeout(r, 50))

    const done = getSemanticModelInstallJobStatus()
    assert.equal(done.phase, 'ready')
    assert.equal(done.percent, 100)
    assert.equal(done.installed, true)
    assert.equal(done.error, null)
  })

  it('concurrent start does not double-run download', async () => {
    const {
      startSemanticModelInstallJob,
      getSemanticModelInstallJobStatus,
      setSemanticModelInstallPipelineDepsForTests,
    } = await importJob()

    let resolveDownload
    const downloadGate = new Promise(resolve => { resolveDownload = resolve })
    let downloadCalls = 0
    let installed = false

    setSemanticModelInstallPipelineDepsForTests({
      getStatus: () => ({
        installed,
        label: '语义检索模型',
        dir: '/tmp',
        missingFiles: installed ? [] : ['config.json'],
        source: installed ? 'user' : 'missing',
      }),
      download: async () => {
        downloadCalls += 1
        await downloadGate
        installed = true
        return {
          installed: true,
          dir: '/tmp',
          missingFiles: [],
          source: 'user',
        }
      },
      tryEnable: async () => true,
    })

    const a = startSemanticModelInstallJob()
    const b = startSemanticModelInstallJob()
    assert.equal(a.phase, getSemanticModelInstallJobStatus().phase)
    assert.equal(b.phase, getSemanticModelInstallJobStatus().phase)
    assert.equal(downloadCalls, 1)

    resolveDownload()
    await new Promise(r => setTimeout(r, 40))
    assert.equal(downloadCalls, 1)
    assert.equal(getSemanticModelInstallJobStatus().phase, 'ready')
  })

  it('maps failures to product-level error without URLs', async () => {
    const {
      startSemanticModelInstallJob,
      getSemanticModelInstallJobStatus,
      setSemanticModelInstallPipelineDepsForTests,
      toSemanticInstallUserError,
    } = await importJob()

    assert.match(
      toSemanticInstallUserError(new Error('无法下载 https://hf.co/x 超时')),
      /超时|重试|下载/,
    )
    assert.ok(!toSemanticInstallUserError(new Error('fail https://evil.example/a')).includes('http'))

    setSemanticModelInstallPipelineDepsForTests({
      getStatus: missingStatus,
      download: async () => {
        throw new Error('无法下载语义检索模型文件 onnx（https://cdn.example/model）')
      },
      tryEnable: async () => false,
    })

    startSemanticModelInstallJob()
    await new Promise(r => setTimeout(r, 30))

    const job = getSemanticModelInstallJobStatus()
    assert.equal(job.phase, 'error')
    assert.ok(job.error)
    assert.ok(!/https?:\/\//.test(job.error))
    assert.ok(!/https?:\/\//.test(job.message))
  })
})
