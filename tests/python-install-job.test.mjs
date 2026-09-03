import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

const repoRoot = path.resolve(import.meta.dirname, '..')

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

describe('ensurePythonReady', () => {
  it('returns ready when status is ready', async () => {
    const {
      ensurePythonReady,
      resetEnsurePythonDepsForTests,
      setEnsurePythonDepsForTests,
    } = await import(
      path.join(repoRoot, 'packages/agent-workspace/dist/python/ensure-python.js')
    )

    setEnsurePythonDepsForTests({
      getStatus: async () => ({
        system_path: '/usr/bin/python3',
        system_version: 'Python 3.12.0',
        opptrix_path: null,
        opptrix_version: null,
        active_source: 'system',
        active_path: '/usr/bin/python3',
        active_version: 'Python 3.12.0',
        ready: true,
        recommend_install: false,
        message: '已检测到系统 Python，可直接运行脚本与安装依赖。',
      }),
    })

    try {
      const ensured = await ensurePythonReady()
      assert.equal(ensured.ok, true)
      assert.equal(ensured.ready, true)
      assert.equal(ensured.status, 'ready')
      assert.equal(ensured.recommend_install, false)
      assert.equal(ensured.active_source, 'system')
    } finally {
      resetEnsurePythonDepsForTests()
    }
  })

  it('returns failed without starting install when not ready', async () => {
    const {
      ensurePythonReady,
      resetEnsurePythonDepsForTests,
      setEnsurePythonDepsForTests,
    } = await import(
      path.join(repoRoot, 'packages/agent-workspace/dist/python/ensure-python.js')
    )

    setEnsurePythonDepsForTests({
      getStatus: async () => ({
        system_path: null,
        system_version: null,
        opptrix_path: null,
        opptrix_version: null,
        active_source: 'none',
        active_path: null,
        active_version: null,
        ready: false,
        recommend_install: false,
        message: '尚未检测到可用的 Python。请在本机安装 Python 3，或使用已内置运行环境的桌面版。',
      }),
    })

    try {
      const ensured = await ensurePythonReady()
      assert.equal(ensured.ok, false)
      assert.equal(ensured.ready, false)
      assert.equal(ensured.status, 'failed')
      assert.equal(ensured.recommend_install, false)
      assert.match(ensured.message, /Python/)
      assert.equal('job_id' in ensured, false)
    } finally {
      resetEnsurePythonDepsForTests()
    }
  })
})
