/**
 * session-state 孤儿目录 + 用户数据半成品临时文件 prune。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir, utimes, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, before, after } from 'node:test'

describe('pruneOrphanSessionState + incomplete temps', () => {
  /** @type {string} */
  let dir
  /** @type {string | undefined} */
  let prevDataDir

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'opptrix-session-orphan-'))
    prevDataDir = process.env.OPPTRIX_DATA_DIR
    process.env.OPPTRIX_DATA_DIR = dir
  })

  after(async () => {
    if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDataDir
    await rm(dir, { recursive: true, force: true })
  })

  it('removes unknown session-state dirs; keeps known', async () => {
    const { pruneOrphanSessionState, resolveSessionStateRoot } = await import(
      '../packages/agent-workspace/dist/index.js'
    )
    const root = resolveSessionStateRoot()
    await mkdir(join(root, 'known-session'), { recursive: true })
    await mkdir(join(root, 'orphan-session'), { recursive: true })
    await writeFile(join(root, 'known-session', 'context-projection.json'), '{}')
    await writeFile(join(root, 'orphan-session', 'context-projection.json'), '{}')

    const removed = pruneOrphanSessionState(['known-session'])
    assert.equal(removed, 1)
    await access(join(root, 'known-session'))
    await assert.rejects(() => access(join(root, 'orphan-session')), /ENOENT/)
  })

  it('prunes stale *.download / .tmp; keeps fresh', async () => {
    const {
      pruneIncompleteUserDataTemps,
      DEFAULT_INCOMPLETE_TEMP_MAX_AGE_MS,
    } = await import('../packages/shared/dist/index.js')

    const staleDl = join(dir, 'llms', 'model.bin.download')
    const freshDl = join(dir, 'llms', 'other.bin.download')
    const staleTmp = join(dir, 'engines', 'x.tmp')
    const keepFile = join(dir, 'llms', 'model.bin')
    await mkdir(join(dir, 'llms'), { recursive: true })
    await mkdir(join(dir, 'engines'), { recursive: true })
    await writeFile(staleDl, 'x')
    await writeFile(freshDl, 'y')
    await writeFile(staleTmp, 'z')
    await writeFile(keepFile, 'keep')

    const now = Date.now()
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000)
    const recent = new Date(now - 60_000)
    await utimes(staleDl, twoHoursAgo, twoHoursAgo)
    await utimes(staleTmp, twoHoursAgo, twoHoursAgo)
    await utimes(freshDl, recent, recent)

    const result = pruneIncompleteUserDataTemps({
      root: dir,
      maxAgeMs: DEFAULT_INCOMPLETE_TEMP_MAX_AGE_MS,
      nowMs: now,
    })
    assert.equal(result.removedFiles, 2)
    assert.equal(result.skippedFresh, 1)
    await assert.rejects(() => access(staleDl), /ENOENT/)
    await assert.rejects(() => access(staleTmp), /ENOENT/)
    await access(freshDl)
    await access(keepFile)
  })
})
