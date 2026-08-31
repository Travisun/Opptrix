/**
 * Workspace grant path allowlist — mounts / shared / session；拒绝 .. 与逃逸。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  assertGrantPathAllowed,
  isGrantPathAllowlisted,
  listMountRoots,
  emptyMountsReason,
  browseWorkspaceDirs,
  resolveMountsRoot,
  resolveSharedWorkspaceRoot,
  resolveSessionWorkspaceRoot,
  ensureSharedWorkspaceLayout,
  resetSharedWorkspaceLayoutCacheForTests,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-mounts-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  const prevDesktop = process.env.OPPTRIX_DESKTOP
  process.env.OPPTRIX_DATA_DIR = tmp
  delete process.env.OPPTRIX_DESKTOP
  resetSharedWorkspaceLayoutCacheForTests()
  try {
    await fn(tmp)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    if (prevDesktop == null) delete process.env.OPPTRIX_DESKTOP
    else process.env.OPPTRIX_DESKTOP = prevDesktop
    resetSharedWorkspaceLayoutCacheForTests()
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

test('listMountRoots returns direct children only; empty when missing', async () => {
  await withTmpDataDir(async (tmp) => {
    const empty = await listMountRoots()
    assert.deepEqual(empty, [])
    assert.match(emptyMountsReason(), /已挂载目录/)

    const mounts = path.join(tmp, 'mounts')
    await fs.mkdir(path.join(mounts, 'alpha'), { recursive: true })
    await fs.mkdir(path.join(mounts, 'beta', 'nested'), { recursive: true })
    await fs.writeFile(path.join(mounts, 'not-a-dir.txt'), 'x')

    const listed = await listMountRoots()
    assert.equal(listed.length, 2)
    assert.equal(listed[0].name, 'alpha')
    assert.equal(listed[1].name, 'beta')
    assert.equal(listed[0].abs_path, path.join(mounts, 'alpha'))
  })
})

test('assertGrantPathAllowed rejects outside mounts/shared/session', async () => {
  await withTmpDataDir(async (tmp) => {
    await ensureSharedWorkspaceLayout()
    const mounts = resolveMountsRoot()
    const allowed = path.join(mounts, 'docs')
    await fs.mkdir(path.join(allowed, 'sub'), { recursive: true })

    const sessionId = 'sess_allow_1'
    const sessionRoot = resolveSessionWorkspaceRoot(sessionId)
    await fs.mkdir(sessionRoot, { recursive: true })

    assert.equal(isGrantPathAllowlisted(allowed, sessionId), true)
    assert.equal(isGrantPathAllowlisted(path.join(allowed, 'sub'), sessionId), true)
    assert.equal(isGrantPathAllowlisted(resolveSharedWorkspaceRoot(), sessionId), true)
    assert.equal(isGrantPathAllowlisted(sessionRoot, sessionId), true)

    const outside = path.join(tmp, 'outside-secret')
    await fs.mkdir(outside, { recursive: true })
    assert.equal(isGrantPathAllowlisted(outside, sessionId), false)

    assert.throws(
      () => assertGrantPathAllowed(outside, { sessionId, enforceAllowlist: true }),
      /已挂载|工作区|公共资产/,
    )

    // .. 逃逸：resolve 后落在 mounts 外
    const escapeViaDotDot = path.join(allowed, '..', '..', 'outside-secret')
    assert.throws(
      () => assertGrantPathAllowed(escapeViaDotDot, { sessionId, enforceAllowlist: true }),
      /已挂载|工作区|公共资产/,
    )

    const ok = assertGrantPathAllowed(path.join(allowed, 'sub'), {
      sessionId,
      enforceAllowlist: true,
    })
    assert.equal(ok, path.resolve(path.join(allowed, 'sub')))
  })
})

test('assertGrantPathAllowed rejects denied paths even when under mounts', async () => {
  await withTmpDataDir(async (tmp) => {
    // opptrix.db 在全局 Deny；即使误放在 mounts 下也不应授权
    const mounts = resolveMountsRoot()
    await fs.mkdir(mounts, { recursive: true })
    const fake = path.join(tmp, 'opptrix.db')
    await fs.writeFile(fake, 'sqlite')
    assert.throws(
      () => assertGrantPathAllowed(fake, { enforceAllowlist: true }),
      /受保护|无法授权/,
    )
  })
})

test('browseWorkspaceDirs rejects root escape and .. in path', async () => {
  await withTmpDataDir(async (tmp) => {
    await ensureSharedWorkspaceLayout()
    const mounts = resolveMountsRoot()
    const root = path.join(mounts, 'lib')
    await fs.mkdir(path.join(root, 'a', 'b'), { recursive: true })
    await fs.writeFile(path.join(root, 'file.txt'), 'x')

    const listed = await browseWorkspaceDirs(root, '')
    assert.equal(listed.entries.some(e => e.name === 'a'), true)
    assert.equal(listed.entries.some(e => e.name === 'file.txt'), false)

    const nested = await browseWorkspaceDirs(root, 'a')
    assert.equal(nested.entries.some(e => e.name === 'b'), true)

    await assert.rejects(
      () => browseWorkspaceDirs(root, '../..'),
      /穿越|\.\.|授权/,
    )
    await assert.rejects(
      () => browseWorkspaceDirs(path.join(tmp, 'not-a-mount'), ''),
      /已挂载|公共资产/,
    )
  })
})
