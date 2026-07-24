import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

const repoRoot = path.resolve(import.meta.dirname, '..')

async function importInstallJob() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/python/install-job.js'))
}

async function importCatalog() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/python/catalog.js'))
}

async function importDownload() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/python/download.js'))
}

describe('python catalog', () => {
  it('includes win-arm64 embed artifact resolvable by platform key', async () => {
    const { getPythonPlatformArtifact } = await importCatalog()
    const artifact = getPythonPlatformArtifact('win-arm64')
    assert.ok(artifact)
    assert.equal(artifact.platformKey, 'win-arm64')
    assert.equal(artifact.kind, 'embed')
    assert.match(artifact.filename, /embed-arm64\.zip$/)
    assert.ok(artifact.urls.length >= 1)
    assert.match(artifact.urls[0], /cdn\.npmmirror\.com/)
  })

  it('uses miniconda mirrors for macOS and Linux without GitHub priority', async () => {
    const { listPythonPlatformArtifacts } = await importCatalog()
    const unixArtifacts = listPythonPlatformArtifacts().filter(a =>
      a.platformKey.startsWith('darwin-') || a.platformKey.startsWith('linux-'),
    )
    assert.ok(unixArtifacts.length >= 4)
    for (const artifact of unixArtifacts) {
      assert.equal(artifact.kind, 'miniconda')
      assert.match(artifact.urls[0], /mirrors\.tuna\.tsinghua\.edu\.cn/)
      assert.ok(!artifact.urls.some(url => url.includes('github.com')))
      assert.ok(!artifact.urls.some(url => url.includes('ghproxy')))
    }
  })

  it('prefers cdn.npmmirror for Windows embed downloads', async () => {
    const { listPythonPlatformArtifacts } = await importCatalog()
    for (const artifact of listPythonPlatformArtifacts().filter(a => a.kind === 'embed')) {
      assert.match(artifact.urls[0], /cdn\.npmmirror\.com/)
    }
  })
})

describe('python download', () => {
  it('rejects HTML responses disguised as successful downloads', async () => {
    const { downloadPythonArtifact } = await importDownload()
    const originalFetch = globalThis.fetch
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-py-dl-'))
    const destPath = path.join(tmpDir, 'fake.zip')

    globalThis.fetch = async () => new Response('<!DOCTYPE html><html><body>error</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })

    try {
      await assert.rejects(
        () => downloadPythonArtifact({
          platformKey: 'win-amd64',
          version: '3.12.8',
          kind: 'embed',
          filename: 'python-3.12.8-embed-amd64.zip',
          urls: ['https://mirror.example/fake.zip', 'https://mirror.example/fake2.zip'],
        }, destPath),
        (err) => {
          assert.ok(err instanceof Error)
          assert.match(err.message, /所有下载源均失败/)
          assert.match(err.message, /无效页面/)
          return true
        },
      )
    } finally {
      globalThis.fetch = originalFetch
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('python install job', () => {
  beforeEach(async () => {
    const mod = await importInstallJob()
    mod.resetPythonInstallJobForTests()
  })

  afterEach(async () => {
    const mod = await importInstallJob()
    mod.resetPythonInstallJobForTests()
  })

  it('returns idle snapshot by default', async () => {
    const { getPythonInstallJobStatus } = await importInstallJob()
    const job = getPythonInstallJobStatus()
    assert.equal(job.state, 'idle')
    assert.equal(job.accepted, false)
    assert.equal(job.phase, 'idle')
    assert.equal(job.percent, 0)
    assert.ok(Array.isArray(job.steps) && job.steps.length >= 4)
    assert.ok(!job.message.includes('即将支持'))
  })

  it('POST install is idempotent while running', async () => {
    const {
      startPythonInstallJob,
      getPythonInstallJobStatus,
      setPythonInstallPipelineDepsForTests,
    } = await importInstallJob()

    let resolveDownload
    const downloadGate = new Promise(resolve => { resolveDownload = resolve })

    setPythonInstallPipelineDepsForTests({
      resolveArtifact: () => ({
        platformKey: 'win-amd64',
        version: '3.12.8',
        kind: 'embed',
        filename: 'python-3.12.8-embed-amd64.zip',
        urls: ['https://example.com/python.zip'],
      }),
      downloadArtifact: async (_artifact, _dest, opts) => {
        opts?.onProgress?.({ url: 'mock', bytesDownloaded: 100, bytesTotal: 1000 })
        await downloadGate
        return {
          destPath: _dest,
          bytesDownloaded: 1000,
          sha256: 'abc',
          sourceUrl: 'mock',
        }
      },
      installArtifact: async () => ({
        manifest: {
          version: '3.12.8',
          platformKey: 'win-amd64',
          kind: 'embed',
          installedAt: new Date().toISOString(),
          installDir: '/tmp/opptrix-python',
          runtimeRoot: '/tmp/opptrix-python',
          pythonPath: '/tmp/opptrix-python/python.exe',
          pythonVersion: 'Python 3.12.8',
        },
        installDir: '/tmp/opptrix-python',
        runtimeRoot: '/tmp/opptrix-python',
        pythonPath: '/tmp/opptrix-python/python.exe',
      }),
      bootstrapPip: async () => {},
    })

    const first = startPythonInstallJob()
    assert.equal(first.accepted, true)
    assert.ok(first.state === 'queued' || first.state === 'running')

    const second = startPythonInstallJob()
    assert.equal(second.state, getPythonInstallJobStatus().state)
    assert.equal(second.percent, getPythonInstallJobStatus().percent)

    resolveDownload()
    await new Promise(r => setTimeout(r, 50))

    const done = getPythonInstallJobStatus()
    assert.equal(done.state, 'completed')
    assert.equal(done.percent, 100)
    assert.ok(done.message.includes('已安装'))
  })

  it('marks failed when platform unsupported', async () => {
    const {
      startPythonInstallJob,
      getPythonInstallJobStatus,
      setPythonInstallPipelineDepsForTests,
    } = await importInstallJob()

    setPythonInstallPipelineDepsForTests({
      resolveArtifact: () => null,
    })

    startPythonInstallJob()
    await new Promise(r => setTimeout(r, 20))

    const job = getPythonInstallJobStatus()
    assert.equal(job.state, 'failed')
    assert.ok(job.error)
    assert.ok(job.message.includes('暂不支持') || job.message.includes('系统'))
  })

  it('surfaces download errors with retry-friendly message', async () => {
    const {
      startPythonInstallJob,
      getPythonInstallJobStatus,
      setPythonInstallPipelineDepsForTests,
    } = await importInstallJob()

    setPythonInstallPipelineDepsForTests({
      resolveArtifact: () => ({
        platformKey: 'win-amd64',
        version: '3.12.8',
        kind: 'embed',
        filename: 'python-3.12.8-embed-amd64.zip',
        urls: ['https://example.com/python.zip'],
      }),
      downloadArtifact: async () => {
        throw new Error('安装包校验失败，请稍后重试')
      },
      installArtifact: async () => {
        throw new Error('should not install')
      },
      bootstrapPip: async () => {},
    })

    startPythonInstallJob()
    await new Promise(r => setTimeout(r, 30))

    const job = getPythonInstallJobStatus()
    assert.equal(job.state, 'failed')
    assert.match(job.message, /校验失败|重试/)
  })
})

describe('python installer cleanup', () => {
  it('removes leftover install dir and does not pre-create for miniconda', async () => {
    const { prepareCleanInstallDir } = await import(
      path.join(repoRoot, 'packages/agent-workspace/dist/python/installer.js')
    )
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-py-rt-'))
    const installDir = path.join(runtimeRoot, '3.12.8-darwin-arm64')
    const current = path.join(runtimeRoot, 'current')
    await fs.mkdir(installDir, { recursive: true })
    await fs.writeFile(path.join(installDir, 'stale.txt'), 'old')
    await fs.symlink(installDir, current, 'dir')

    await prepareCleanInstallDir(runtimeRoot, installDir, 'miniconda')

    await assert.rejects(() => fs.access(installDir), { code: 'ENOENT' })
    await assert.rejects(() => fs.access(current), { code: 'ENOENT' })
  })

  it('recreates empty install dir for embed kind', async () => {
    const { prepareCleanInstallDir } = await import(
      path.join(repoRoot, 'packages/agent-workspace/dist/python/installer.js')
    )
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-py-rt-'))
    const installDir = path.join(runtimeRoot, '3.12.8-win-amd64')
    await fs.mkdir(installDir, { recursive: true })
    await fs.writeFile(path.join(installDir, 'stale.txt'), 'old')

    await prepareCleanInstallDir(runtimeRoot, installDir, 'embed')

    const st = await fs.stat(installDir)
    assert.ok(st.isDirectory())
    await assert.rejects(() => fs.access(path.join(installDir, 'stale.txt')), { code: 'ENOENT' })
  })
})
