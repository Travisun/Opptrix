/**
 * Agent Workspace — 路径 jail、Deny、SSRF、配额、sticky、会话清理
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  WorkspaceService,
  resolveSafePath,
  isPathDenied,
  buildGlobalDenyPaths,
  assertAllowedUrl,
  StickyPolicyStore,
  GrantStore,
  DEFAULT_WORKSPACE_QUOTA_BYTES,
  SHARED_ROOT_ID,
  resolveSharedWorkspaceRoot,
  resetSharedWorkspaceLayoutCacheForTests,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-ws-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  try {
    await fn(tmp)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

test('path jail rejects .. traversal', async () => {
  await withTmpDataDir(async (tmp) => {
    const root = path.join(tmp, 'agent-workspace')
    await fs.mkdir(root, { recursive: true })
    await assert.rejects(
      () => resolveSafePath(root, '../opptrix.db'),
      /路径|授权|穿越/,
    )
  })
})

test('path jail rejects symlink escape', async () => {
  await withTmpDataDir(async (tmp) => {
    const root = path.join(tmp, 'agent-workspace')
    const outside = path.join(tmp, 'outside-secret')
    await fs.mkdir(root, { recursive: true })
    await fs.mkdir(outside, { recursive: true })
    await fs.writeFile(path.join(outside, 'leak.txt'), 'secret')
    const link = path.join(root, 'escape-link')
    await fs.symlink(outside, link)
    await assert.rejects(
      () => resolveSafePath(root, 'escape-link/leak.txt'),
      /符号链接|授权|路径/,
    )
  })
})

test('global deny blocks opptrix.db and agent-privileges even under grant', async () => {
  await withTmpDataDir(async (tmp) => {
    const dbPath = path.join(tmp, 'opptrix.db')
    await fs.writeFile(dbPath, 'sqlite')
    assert.equal(isPathDenied(dbPath), true)
    const priv = path.join(tmp, 'agent-privileges')
    await fs.mkdir(priv, { recursive: true })
    assert.equal(isPathDenied(path.join(priv, 'sticky.json')), true)
    const tushare = path.join(tmp, 'tushare-config.json')
    await fs.writeFile(tushare, '{}')
    assert.equal(isPathDenied(tushare), true)
    const watchlist = path.join(tmp, 'watchlist.json')
    await fs.writeFile(watchlist, '[]')
    assert.equal(isPathDenied(watchlist), true)
    assert.ok(buildGlobalDenyPaths().length >= 8)
  })
})

test('SSRF blocks localhost and private networks', async () => {
  await assert.rejects(() => assertAllowedUrl('http://127.0.0.1/test'), /不允许|本地|私有/)
  await assert.rejects(() => assertAllowedUrl('http://localhost/test'), /不允许|本地/)
  await assert.rejects(() => assertAllowedUrl('http://192.168.1.1/test'), /不允许|私有/)
  await assert.rejects(() => assertAllowedUrl('http://169.254.169.254/latest/meta-data'), /不允许/)
})

test('quota rejects write when over limit', async () => {
  await withTmpDataDir(async (tmp) => {
    const wsRoot = path.join(tmp, 'agent-workspace')
    await fs.mkdir(wsRoot, { recursive: true })
    await fs.writeFile(path.join(wsRoot, 'big.bin'), Buffer.alloc(2048))
    const svc = new WorkspaceService({ quotaBytes: 1024 })
    const sessionId = 'quota-test'
    await svc.ensureDefaultRoot(sessionId)
    await assert.rejects(
      () => svc.writeFile(sessionId, 'default', 'extra.txt', 'x'.repeat(512)),
      /上限|配额|存储/,
    )
  })
})

test('delete/overwrite without sticky requires confirm handler', async () => {
  await withTmpDataDir(async (tmp) => {
    const svc = new WorkspaceService()
    const sessionId = 'confirm-test'
    await svc.ensureDefaultRoot(sessionId)
    await svc.writeFile(sessionId, 'default', 'a.txt', 'hello', async () => ({
      selected_ids: ['once'],
    }))
    await svc.writeFile(sessionId, 'default', 'a.txt', 'world', async () => ({
      selected_ids: ['cancel'],
    })).then(
      () => assert.fail('should cancel'),
      err => assert.match(String(err.message), /取消/),
    )
  })
})

test('sticky persists for session and clears on deleteSession', async () => {
  const sticky = new StickyPolicyStore()
  const sessionId = 'sticky-sess'
  assert.equal(sticky.has(sessionId, 'default', 'delete'), false)
  sticky.grant(sessionId, 'default', 'delete')
  assert.equal(sticky.has(sessionId, 'default', 'delete'), true)
  sticky.clearSession(sessionId)
  assert.equal(sticky.has(sessionId, 'default', 'delete'), false)
})

test('grant store clears on session delete', async () => {
  const grants = new GrantStore()
  const sessionId = 'grant-sess'
  await grants.ensureDefaultRoot(sessionId)
  grants.addGrant(sessionId, os.tmpdir(), 'ro', 'tmp')
  assert.equal(grants.listGrants(sessionId).length, 3)
  grants.clearSession(sessionId)
  assert.equal(grants.listGrants(sessionId).length, 0)
})

test('agent cannot read deny paths via workspace service', async () => {
  await withTmpDataDir(async (tmp) => {
    const svc = new WorkspaceService()
    const sessionId = 'deny-read'
    const dbPath = path.join(tmp, 'opptrix.db')
    await fs.writeFile(dbPath, 'secret-db')
    svc.addGrant(sessionId, tmp, 'rw', 'userData')
    await assert.rejects(
      () => svc.readFile(sessionId, svc.getGrantStore().listGrants(sessionId).find(g => !g.is_default).root_id, 'opptrix.db'),
      /保护|拒绝|Deny|路径/,
    )
  })
})

test('DEFAULT_WORKSPACE_QUOTA_BYTES is 20GB', () => {
  assert.equal(DEFAULT_WORKSPACE_QUOTA_BYTES, 20 * 1024 ** 3)
})

test('ensureDefaultRoot uses per-session subdirectory', async () => {
  await withTmpDataDir(async (tmp) => {
    const svc = new WorkspaceService()
    const a = await svc.ensureDefaultRoot('session-alpha')
    const b = await svc.ensureDefaultRoot('session-beta')
    assert.notEqual(a.abs_path, b.abs_path)
    assert.match(a.abs_path, /sessions[\\/]session-alpha[\\/]?$/)
    assert.match(b.abs_path, /sessions[\\/]session-beta[\\/]?$/)
    assert.equal(a.label, '本对话工作区')
    const statA = await fs.stat(a.abs_path)
    const statB = await fs.stat(b.abs_path)
    assert.equal(statA.isDirectory(), true)
    assert.equal(statB.isDirectory(), true)
  })
})

test('legacy files migrate into _legacy idempotently', async () => {
  await withTmpDataDir(async (tmp) => {
    const wsRoot = path.join(tmp, 'agent-workspace')
    await fs.mkdir(wsRoot, { recursive: true })
    await fs.writeFile(path.join(wsRoot, 'old-note.txt'), 'legacy')
    const svc = new WorkspaceService()
    await svc.ensureDefaultRoot('migrate-test')
    const legacyFile = path.join(wsRoot, '_legacy', 'old-note.txt')
    const content = await fs.readFile(legacyFile, 'utf8')
    assert.equal(content, 'legacy')
    await assert.rejects(() => fs.access(path.join(wsRoot, 'old-note.txt')))
    await svc.ensureDefaultRoot('migrate-test-2')
    assert.equal(await fs.readFile(legacyFile, 'utf8'), 'legacy')
  })
})

test('clearSession removes session workspace directory', async () => {
  await withTmpDataDir(async (tmp) => {
    const svc = new WorkspaceService()
    const sessionId = 'cleanup-sess'
    const grant = await svc.ensureDefaultRoot(sessionId)
    await fs.writeFile(path.join(grant.abs_path, 'tmp.txt'), 'x')
    svc.clearSession(sessionId)
    await new Promise(r => setTimeout(r, 50))
    await assert.rejects(() => fs.access(grant.abs_path))
  })
})

test('listGrants orders default then shared then extras', async () => {
  const grants = new GrantStore()
  const sessionId = 'order-sess'
  await grants.ensureDefaultRoot(sessionId)
  grants.addGrant(sessionId, os.tmpdir(), 'ro', 'extra-a')
  grants.addGrant(sessionId, path.join(os.tmpdir(), 'b'), 'rw', 'extra-b')
  const listed = grants.listGrants(sessionId)
  assert.equal(listed.length, 4)
  assert.equal(listed[0].is_default, true)
  assert.equal(listed[1].root_id, SHARED_ROOT_ID)
  assert.equal(listed[1].label, '公共资产')
  assert.ok(listed[2].root_id.startsWith('grant_'))
  assert.ok(listed[3].root_id.startsWith('grant_'))
})

test('removeGrant rejects default and shared grants', async () => {
  const grants = new GrantStore()
  const sessionId = 'remove-builtin'
  await grants.ensureDefaultRoot(sessionId)
  const listed = grants.listGrants(sessionId)
  const defaultGrant = listed.find(g => g.is_default)
  const sharedGrant = listed.find(g => g.root_id === SHARED_ROOT_ID)
  assert.ok(defaultGrant)
  assert.ok(sharedGrant)
  assert.equal(grants.removeGrant(sessionId, defaultGrant.id), false)
  assert.equal(grants.removeGrant(sessionId, sharedGrant.id), false)
  const extra = grants.addGrant(sessionId, os.tmpdir(), 'ro', 'tmp')
  assert.equal(grants.removeGrant(sessionId, extra.id), true)
  assert.equal(grants.listGrants(sessionId).length, 2)
})

test('shared workspace auto-granted and survives clearSession', async () => {
  await withTmpDataDir(async () => {
    resetSharedWorkspaceLayoutCacheForTests()
    const svc = new WorkspaceService()
    const sessionId = 'shared-sess'
    await svc.ensureDefaultRoot(sessionId)
    const grants = await svc.listGrants(sessionId)
    const shared = grants.find(g => g.root_id === SHARED_ROOT_ID)
    assert.ok(shared)
    assert.equal(shared.mode, 'rw')
    assert.equal(shared.label, '公共资产')
    const sharedRoot = resolveSharedWorkspaceRoot()
    await fs.access(path.join(sharedRoot, 'README.md'))
    await fs.access(path.join(sharedRoot, 'data', 'dumps'))
    await fs.writeFile(path.join(sharedRoot, 'data', 'dumps', 'keep.txt'), 'persist')
    svc.clearSession(sessionId)
    await new Promise(r => setTimeout(r, 50))
    assert.equal(await fs.readFile(path.join(sharedRoot, 'data', 'dumps', 'keep.txt'), 'utf8'), 'persist')
  })
})

test('invalid session id rejected for workspace root', async () => {
  await withTmpDataDir(async () => {
    const svc = new WorkspaceService()
    await assert.rejects(
      () => svc.ensureDefaultRoot('../evil'),
      /无效|会话/,
    )
  })
})
