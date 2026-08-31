/**
 * Workspace isolation (no-SRT default): mode flag, sensitive paths, allowlist, host extract.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  resolveShellIsolationMode,
  getShellPlatformStatus,
  assertGrantPathAllowed,
  resolveSafePath,
  isSensitiveRelPath,
  extractExplicitHostsFromArgv,
  DenyPathError,
  PathEscapeError,
  ensureSharedWorkspaceLayout,
  resolveMountsRoot,
  resolveSessionWorkspaceRoot,
  resetSharedWorkspaceLayoutCacheForTests,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-ws-iso-'))
  const prevData = process.env.OPPTRIX_DATA_DIR
  const prevIso = process.env.OPPTRIX_SHELL_ISOLATION
  const prevDesktop = process.env.OPPTRIX_DESKTOP
  process.env.OPPTRIX_DATA_DIR = tmp
  delete process.env.OPPTRIX_SHELL_ISOLATION
  delete process.env.OPPTRIX_DESKTOP
  resetSharedWorkspaceLayoutCacheForTests()
  try {
    await fn(tmp)
  } finally {
    if (prevData == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevData
    if (prevIso == null) delete process.env.OPPTRIX_SHELL_ISOLATION
    else process.env.OPPTRIX_SHELL_ISOLATION = prevIso
    if (prevDesktop == null) delete process.env.OPPTRIX_DESKTOP
    else process.env.OPPTRIX_DESKTOP = prevDesktop
    resetSharedWorkspaceLayoutCacheForTests()
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

test('resolveShellIsolationMode defaults to workspace; srt via env', () => {
  const prev = process.env.OPPTRIX_SHELL_ISOLATION
  try {
    delete process.env.OPPTRIX_SHELL_ISOLATION
    assert.equal(resolveShellIsolationMode(), 'workspace')
    process.env.OPPTRIX_SHELL_ISOLATION = 'SRT'
    assert.equal(resolveShellIsolationMode(), 'srt')
    process.env.OPPTRIX_SHELL_ISOLATION = 'workspace'
    assert.equal(resolveShellIsolationMode(), 'workspace')
  } finally {
    if (prev == null) delete process.env.OPPTRIX_SHELL_ISOLATION
    else process.env.OPPTRIX_SHELL_ISOLATION = prev
  }
})

test('getShellPlatformStatus workspace mode is ready without elevation', async () => {
  await withTmpDataDir(async () => {
    delete process.env.OPPTRIX_SHELL_ISOLATION
    const status = await getShellPlatformStatus()
    assert.equal(status.ready, true)
    assert.equal(status.needs_elevation, false)
    assert.equal(status.isolation_mode, 'workspace')
    assert.equal(status.network_isolation_level, 'basic')
    assert.match(status.message, /工作区/)
  })
})

test('isSensitiveRelPath covers .env and key material', () => {
  assert.equal(isSensitiveRelPath('.env'), true)
  assert.equal(isSensitiveRelPath('.env.local'), true)
  assert.equal(isSensitiveRelPath('subdir/.ssh/id_rsa'), true)
  assert.equal(isSensitiveRelPath('certs/server.pem'), true)
  assert.equal(isSensitiveRelPath('src/main.ts'), false)
})

test('resolveSafePath denies .env under grant', async () => {
  await withTmpDataDir(async () => {
    await ensureSharedWorkspaceLayout()
    const sessionId = 'sess_iso_env'
    const root = resolveSessionWorkspaceRoot(sessionId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(path.join(root, '.env'), 'SECRET=1')
    await assert.rejects(
      () => resolveSafePath(root, '.env'),
      (err) => err instanceof DenyPathError,
    )
  })
})

test('assertGrantPathAllowed always enforces allowlist (even with OPPTRIX_DESKTOP)', async () => {
  await withTmpDataDir(async (tmp) => {
    process.env.OPPTRIX_DESKTOP = '1'
    await ensureSharedWorkspaceLayout()
    const mounts = resolveMountsRoot()
    const allowed = path.join(mounts, 'docs')
    await fs.mkdir(allowed, { recursive: true })
    assert.equal(assertGrantPathAllowed(allowed), path.resolve(allowed))

    const outside = path.join(tmp, 'outside-secret')
    await fs.mkdir(outside, { recursive: true })
    assert.throws(
      () => assertGrantPathAllowed(outside),
      (err) => err instanceof PathEscapeError,
    )
  })
})

test('extractExplicitHostsFromArgv parses URL args only', () => {
  assert.deepEqual(
    extractExplicitHostsFromArgv(['curl', '-L', 'https://Example.COM/path', '-o', 'out']),
    ['example.com'],
  )
  assert.deepEqual(extractExplicitHostsFromArgv(['ping', 'example.com']), [])
  assert.deepEqual(
    extractExplicitHostsFromArgv(['wget', '//cdn.example.org/x']),
    ['cdn.example.org'],
  )
})
