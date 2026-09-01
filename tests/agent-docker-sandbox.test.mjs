/**
 * Docker self-host: agent sandbox mode + python resolve + platform status
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function importAgentWorkspace() {
  return import('../packages/agent-workspace/dist/index.js')
}

async function withEnv(overrides, fn) {
  const saved = {}
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('resolveAgentSandboxMode defaults off in Docker env', async () => {
  const { resolveAgentSandboxMode } = await importAgentWorkspace()
  await withEnv({ OPPTRIX_DOCKER: '1', OPPTRIX_AGENT_SANDBOX: undefined }, () => {
    assert.equal(resolveAgentSandboxMode(), 'off')
  })
  await withEnv({ OPPTRIX_DOCKER: undefined, OPPTRIX_AGENT_SANDBOX: undefined }, () => {
    assert.equal(resolveAgentSandboxMode(), 'full')
  })
  await withEnv({ OPPTRIX_DOCKER: '1', OPPTRIX_AGENT_SANDBOX: 'full' }, () => {
    assert.equal(resolveAgentSandboxMode(), 'full')
  })
})

test('getShellPlatformStatus reports agent_sandbox off in Docker', async () => {
  const { getShellPlatformStatus } = await importAgentWorkspace()
  await withEnv({ OPPTRIX_DOCKER: '1', OPPTRIX_AGENT_SANDBOX: 'off' }, async () => {
    const status = await getShellPlatformStatus()
    assert.equal(status.ready, true)
    assert.equal(status.agent_sandbox, 'off')
    assert.equal(status.isolation_mode, undefined)
    assert.match(status.message, /系统权限|Docker/)
  })
})

test('resolvePythonRuntime prefers system and skips managed install in Docker', async (t) => {
  const { resolvePythonRuntime } = await importAgentWorkspace()
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  let systemPython = null
  for (const name of ['python3', 'python']) {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which'
      const { stdout } = await execFileAsync(cmd, [name])
      systemPython = stdout.trim().split(/\r?\n/)[0]?.trim() || null
      if (systemPython) break
    } catch {
      /* next */
    }
  }
  if (!systemPython) {
    t.skip('no system python on PATH')
    return
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-docker-py-'))
  const prevData = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp

  await withEnv({
    OPPTRIX_DOCKER: '1',
    OPPTRIX_PYTHON_BUNDLED_DIR: undefined,
    OPPTRIX_PYTHON_PATH: undefined,
  }, async () => {
    const status = await resolvePythonRuntime()
    assert.equal(status.active_source, 'system')
    assert.equal(status.ready, true)
    assert.equal(status.recommend_install, false)
    assert.equal(status.bundled_available, false)
    assert.match(status.message, /系统 Python|Docker/)
  })

  if (prevData === undefined) delete process.env.OPPTRIX_DATA_DIR
  else process.env.OPPTRIX_DATA_DIR = prevData
  await fs.rm(tmp, { recursive: true, force: true })
})

test('ensurePythonReady does not start install job in Docker', async () => {
  const { ensurePythonReady, setEnsurePythonDepsForTests, resetEnsurePythonDepsForTests } =
    await import('../packages/agent-workspace/dist/python/ensure-python.js')

  let jobStarted = false
  setEnsurePythonDepsForTests({
    getStatus: async () => ({
      ready: false,
      active_source: 'none',
      active_version: null,
      recommend_install: false,
      message: 'Docker 镜像未检测到系统 Python。',
      system_path: null,
      system_version: null,
      opptrix_path: null,
      opptrix_version: null,
      active_path: null,
    }),
    startJob: () => {
      jobStarted = true
      return { state: 'idle', accepted: false, job_id: 'python-install' }
    },
  })

  await withEnv({ OPPTRIX_DOCKER: '1' }, async () => {
    const result = await ensurePythonReady()
    assert.equal(jobStarted, false)
    assert.equal(result.ready, false)
    assert.equal(result.recommend_install, false)
    assert.match(result.message, /Docker|python3/)
  })

  resetEnsurePythonDepsForTests()
})
