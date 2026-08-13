import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, utimes, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const {
  pruneSharedWorkspace,
  isProtectedSharedRelative,
  DEFAULT_SHARED_WORKSPACE_MAX_AGE_MS,
} = await import('../packages/agent-workspace/dist/shared-prune.js')

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

describe('shared workspace prune', () => {
  it('isProtectedSharedRelative guards builtins and readme', () => {
    assert.equal(isProtectedSharedRelative('README.md'), true)
    assert.equal(isProtectedSharedRelative('docs/package-readme-template.md'), true)
    assert.equal(isProtectedSharedRelative('packages/cn-offline-daily-k/package.json'), true)
    assert.equal(isProtectedSharedRelative('data/dumps/old.parquet'), false)
    assert.equal(isProtectedSharedRelative('packages/my-tool/index.js'), false)
  })

  it('TTL removes stale shared files but keeps protected + sessions untouched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opptrix-shared-prune-'))
    const shared = join(root, 'shared')
    const sessions = join(root, 'sessions', 'sess-1')
    try {
      await mkdir(join(shared, 'data', 'dumps'), { recursive: true })
      await mkdir(join(shared, 'packages', 'cn-offline-daily-k'), { recursive: true })
      await mkdir(sessions, { recursive: true })

      await writeFile(join(shared, 'README.md'), '# shared\n', 'utf8')
      await writeFile(join(shared, 'packages', 'cn-offline-daily-k', 'index.js'), 'export {}\n', 'utf8')
      await writeFile(join(shared, 'data', 'dumps', 'old.parquet'), 'old', 'utf8')
      await writeFile(join(shared, 'data', 'dumps', 'fresh.parquet'), 'fresh', 'utf8')
      await writeFile(join(sessions, 'work.txt'), 'session', 'utf8')

      const now = Date.now()
      const oldMs = (now - DEFAULT_SHARED_WORKSPACE_MAX_AGE_MS - 60_000) / 1000
      const freshMs = now / 1000
      await utimes(join(shared, 'data', 'dumps', 'old.parquet'), oldMs, oldMs)
      await utimes(join(shared, 'data', 'dumps', 'fresh.parquet'), freshMs, freshMs)
      await utimes(join(shared, 'README.md'), oldMs, oldMs)
      await utimes(join(shared, 'packages', 'cn-offline-daily-k', 'index.js'), oldMs, oldMs)
      await utimes(join(sessions, 'work.txt'), oldMs, oldMs)

      const result = await pruneSharedWorkspace({
        sharedRoot: shared,
        nowMs: now,
        maxAgeMs: DEFAULT_SHARED_WORKSPACE_MAX_AGE_MS,
        maxBytes: 10 * 1024 * 1024,
      })

      assert.equal(result.removedFiles, 1)
      assert.equal(await exists(join(shared, 'data', 'dumps', 'old.parquet')), false)
      assert.equal(await exists(join(shared, 'data', 'dumps', 'fresh.parquet')), true)
      assert.equal(await exists(join(shared, 'README.md')), true)
      assert.equal(await exists(join(shared, 'packages', 'cn-offline-daily-k', 'index.js')), true)
      assert.equal(await exists(join(sessions, 'work.txt')), true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('maxBytes deletes oldest first', async () => {
    const shared = await mkdtemp(join(tmpdir(), 'opptrix-shared-cap-'))
    try {
      await mkdir(join(shared, 'data', 'cache'), { recursive: true })
      const a = join(shared, 'data', 'cache', 'a.bin')
      const b = join(shared, 'data', 'cache', 'b.bin')
      await writeFile(a, 'aaaa')
      await writeFile(b, 'bbbb')
      const now = Date.now()
      await utimes(a, (now - 10_000) / 1000, (now - 10_000) / 1000)
      await utimes(b, now / 1000, now / 1000)

      const result = await pruneSharedWorkspace({
        sharedRoot: shared,
        nowMs: now,
        maxAgeMs: 0, // disable TTL
        maxBytes: 5, // keep roughly one file
      })

      assert.ok(result.removedFiles >= 1)
      assert.equal(await exists(a), false)
      assert.equal(await exists(b), true)
      assert.ok(result.remainingBytes <= 5)
    } finally {
      await rm(shared, { recursive: true, force: true })
    }
  })
})
