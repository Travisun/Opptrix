/**
 * Docker dual-user DAC + path adapters (workspace/mounts outside private).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  resolveAgentWorkspaceRoot,
  resolveMountsRoot,
  buildGlobalDenyPaths,
  isPathDenied,
  resolveDockerAgentIdentity,
  resolveDockerAgentDropIds,
  isDockerEnv,
  DOCKER_PERSISTENCE_NOTE,
  resetSharedWorkspaceLayoutCacheForTests,
} from '../packages/agent-workspace/dist/index.js'

async function withEnv(env, fn) {
  const prev = {}
  for (const key of Object.keys(env)) {
    prev[key] = process.env[key]
    const v = env[key]
    if (v == null) delete process.env[key]
    else process.env[key] = v
  }
  resetSharedWorkspaceLayoutCacheForTests()
  try {
    await fn()
  } finally {
    for (const key of Object.keys(env)) {
      if (prev[key] == null) delete process.env[key]
      else process.env[key] = prev[key]
    }
    resetSharedWorkspaceLayoutCacheForTests()
  }
}

test('resolveAgentWorkspaceRoot prefers OPPTRIX_AGENT_WORKSPACE_DIR', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-dac-ws-'))
  const data = path.join(tmp, 'private')
  const ws = path.join(tmp, 'workspace')
  await fs.mkdir(data, { recursive: true })
  await fs.mkdir(ws, { recursive: true })
  await withEnv({
    OPPTRIX_DATA_DIR: data,
    OPPTRIX_AGENT_WORKSPACE_DIR: ws,
    OPPTRIX_DOCKER: '1',
  }, async () => {
    assert.equal(resolveAgentWorkspaceRoot(), path.resolve(ws))
    assert.notEqual(resolveAgentWorkspaceRoot(), path.join(data, 'agent-workspace'))
  })
  await fs.rm(tmp, { recursive: true, force: true })
})

test('resolveMountsRoot prefers OPPTRIX_MOUNTS_DIR', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-dac-mt-'))
  const data = path.join(tmp, 'private')
  const mounts = path.join(tmp, 'mounts')
  await fs.mkdir(data, { recursive: true })
  await fs.mkdir(mounts, { recursive: true })
  await withEnv({
    OPPTRIX_DATA_DIR: data,
    OPPTRIX_MOUNTS_DIR: mounts,
  }, async () => {
    assert.equal(resolveMountsRoot(), path.resolve(mounts))
  })
  await fs.rm(tmp, { recursive: true, force: true })
})

test('buildGlobalDenyPaths denies entire private when workspace is outside', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-dac-deny-'))
  const data = path.join(tmp, 'private')
  const ws = path.join(tmp, 'workspace')
  const systemDir = path.join(tmp, 'system')
  await fs.mkdir(data, { recursive: true })
  await fs.mkdir(ws, { recursive: true })
  await fs.mkdir(systemDir, { recursive: true })
  await fs.writeFile(path.join(data, 'opptrix.db'), 'secret')
  await withEnv({
    OPPTRIX_DATA_DIR: data,
    OPPTRIX_AGENT_WORKSPACE_DIR: ws,
    OPPTRIX_SYSTEM_DIR: systemDir,
    OPPTRIX_DOCKER: '1',
  }, async () => {
    const deny = buildGlobalDenyPaths()
    assert.ok(deny.some(p => path.resolve(p) === path.resolve(data)))
    assert.ok(deny.some(p => path.resolve(p) === path.resolve(systemDir)))
    assert.equal(isPathDenied(path.join(data, 'opptrix.db')), true)
    assert.equal(isPathDenied(path.join(ws, 'ok.txt')), false)
  })
  await fs.rm(tmp, { recursive: true, force: true })
})

test('resolveDockerAgentIdentity reads UID/GID; drop requires root', async () => {
  await withEnv({
    OPPTRIX_DOCKER: '1',
    OPPTRIX_AGENT_UID: '10001',
    OPPTRIX_AGENT_GID: '10001',
    OPPTRIX_AGENT_USER: 'opptrix-agent',
    OPPTRIX_SHELL_ISOLATION: undefined,
  }, async () => {
    const id = resolveDockerAgentIdentity()
    assert.deepEqual(id, { uid: 10001, gid: 10001, user: 'opptrix-agent' })
    const drop = resolveDockerAgentDropIds()
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
    if (isRoot) {
      assert.deepEqual(drop, { uid: 10001, gid: 10001 })
    } else {
      assert.equal(drop, null)
    }
  })
})

test('resolveDockerAgentDropIds skips SRT escape hatch', async () => {
  await withEnv({
    OPPTRIX_DOCKER: '1',
    OPPTRIX_AGENT_UID: '10001',
    OPPTRIX_AGENT_GID: '10001',
    OPPTRIX_SHELL_ISOLATION: 'srt',
  }, async () => {
    assert.equal(resolveDockerAgentDropIds(), null)
  })
})

test('DOCKER_PERSISTENCE_NOTE mentions agent isolation', () => {
  assert.match(DOCKER_PERSISTENCE_NOTE, /opptrix-agent/)
  assert.match(DOCKER_PERSISTENCE_NOTE, /workspace/)
})

test('isDockerEnv requires OPPTRIX_DOCKER=1', async () => {
  await withEnv({ OPPTRIX_DOCKER: undefined }, async () => {
    assert.equal(isDockerEnv(), false)
  })
  await withEnv({ OPPTRIX_DOCKER: '1' }, async () => {
    assert.equal(isDockerEnv(), true)
  })
})
