import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

async function importJob() {
  return import(path.join(repoRoot, 'packages/local-inference/dist/sensevoice/sensevoice-ensure-job.js'))
}

const missingInfo = () => ({
  ready: false,
  source: 'missing',
  modelsDir: '/tmp/sensevoice-models',
})

describe('sensevoice ensure job', () => {
  beforeEach(async () => {
    const mod = await importJob()
    mod.resetSenseVoiceEnsureJobForTests()
    mod.setSenseVoiceEnsurePipelineDepsForTests({
      getReadyInfo: missingInfo,
      isReady: () => false,
    })
  })

  afterEach(async () => {
    const mod = await importJob()
    mod.resetSenseVoiceEnsureJobForTests()
  })

  it('returns idle snapshot by default', async () => {
    const { getSenseVoiceEnsureJobStatus } = await importJob()
    const job = getSenseVoiceEnsureJobStatus('q8')
    assert.equal(job.phase, 'idle')
    assert.equal(job.accepted, false)
    assert.equal(job.percent, 0)
    assert.ok(job.message.includes('尚未准备') || job.message.includes('语音识别'))
  })

  it('start returns immediately and status reflects preparing→ready', async () => {
    const {
      startSenseVoiceEnsureJob,
      getSenseVoiceEnsureJobStatus,
      setSenseVoiceEnsurePipelineDepsForTests,
    } = await importJob()

    let resolveEnsure
    const ensureGate = new Promise(resolve => { resolveEnsure = resolve })
    let ready = false

    setSenseVoiceEnsurePipelineDepsForTests({
      getReadyInfo: () => ({
        ready,
        source: ready ? 'user' : 'missing',
        modelsDir: '/tmp/sensevoice-models',
      }),
      isReady: () => ready,
      ensureAssets: async () => {
        await ensureGate
        ready = true
      },
    })

    const t0 = Date.now()
    const first = startSenseVoiceEnsureJob('q8')
    const elapsed = Date.now() - t0
    assert.ok(elapsed < 500, `start should return immediately, took ${elapsed}ms`)
    assert.equal(first.started, true)
    assert.equal(first.accepted, true)
    assert.ok(first.phase === 'preparing' || first.phase === 'downloading')

    await new Promise(r => setTimeout(r, 20))
    const mid = getSenseVoiceEnsureJobStatus()
    assert.ok(mid.phase === 'preparing' || mid.phase === 'downloading')
    assert.ok(mid.percent >= 1)
    assert.ok(mid.message.includes('准备') || mid.message.includes('获取') || mid.message.includes('下载'))
    assert.ok(!/https?:\/\//.test(mid.message))

    resolveEnsure()
    await new Promise(r => setTimeout(r, 50))

    const done = getSenseVoiceEnsureJobStatus()
    assert.equal(done.phase, 'ready')
    assert.equal(done.percent, 100)
    assert.equal(done.ready, true)
    assert.equal(done.error, null)
  })

  it('concurrent start does not double-run ensureAssets', async () => {
    const {
      startSenseVoiceEnsureJob,
      getSenseVoiceEnsureJobStatus,
      setSenseVoiceEnsurePipelineDepsForTests,
    } = await importJob()

    let resolveEnsure
    const ensureGate = new Promise(resolve => { resolveEnsure = resolve })
    let ensureCalls = 0
    let ready = false

    setSenseVoiceEnsurePipelineDepsForTests({
      getReadyInfo: () => ({
        ready,
        source: ready ? 'user' : 'missing',
        modelsDir: '/tmp',
      }),
      isReady: () => ready,
      ensureAssets: async () => {
        ensureCalls += 1
        await ensureGate
        ready = true
      },
    })

    const a = startSenseVoiceEnsureJob('q8')
    const b = startSenseVoiceEnsureJob('q8')
    assert.equal(a.started, true)
    assert.equal(b.started, true)
    assert.equal(ensureCalls, 1)

    resolveEnsure()
    await new Promise(r => setTimeout(r, 50))
    assert.equal(getSenseVoiceEnsureJobStatus().phase, 'ready')
    assert.equal(ensureCalls, 1)
  })

  it('scheduleSenseVoiceEnsureJob shares the same active job', async () => {
    const {
      startSenseVoiceEnsureJob,
      scheduleSenseVoiceEnsureJob,
      setSenseVoiceEnsurePipelineDepsForTests,
    } = await importJob()

    let resolveEnsure
    const ensureGate = new Promise(resolve => { resolveEnsure = resolve })
    let ensureCalls = 0

    setSenseVoiceEnsurePipelineDepsForTests({
      getReadyInfo: missingInfo,
      isReady: () => false,
      ensureAssets: async () => {
        ensureCalls += 1
        await ensureGate
      },
    })

    startSenseVoiceEnsureJob('q8')
    scheduleSenseVoiceEnsureJob('q8')
    assert.equal(ensureCalls, 1)
    resolveEnsure()
    await new Promise(r => setTimeout(r, 30))
  })

  it('maps technical errors to product copy', async () => {
    const { toSenseVoiceEnsureUserError } = await importJob()
    const msg = toSenseVoiceEnsureUserError(
      new Error('download failed https://modelscope.cn/foo /Users/mac/.opptrix/x'),
    )
    assert.ok(!/https?:\/\//.test(msg))
    assert.ok(!/\/Users\//.test(msg))
    assert.ok(msg.includes('语音识别') || msg.includes('重试') || msg.includes('下载'))
  })

  it('already ready returns ready without calling ensureAssets', async () => {
    const {
      startSenseVoiceEnsureJob,
      setSenseVoiceEnsurePipelineDepsForTests,
    } = await importJob()

    let ensureCalls = 0
    setSenseVoiceEnsurePipelineDepsForTests({
      getReadyInfo: () => ({
        ready: true,
        source: 'bundled',
        modelsDir: '/bundled',
      }),
      isReady: () => true,
      ensureAssets: async () => {
        ensureCalls += 1
      },
    })

    const job = startSenseVoiceEnsureJob('q8')
    assert.equal(job.phase, 'ready')
    assert.equal(job.ready, true)
    assert.equal(ensureCalls, 0)
    assert.match(job.message, /识别模型已就绪/)
    assert.ok(!job.message.includes('语音识别已就绪'))
  })
})
