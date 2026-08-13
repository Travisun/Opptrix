import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, utimes, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const {
  pruneBrowserScreenshots,
  resolveBrowserScreenshotMaxAgeMs,
  resolveBrowserScreenshotMaxBytes,
  DEFAULT_BROWSER_SCREENSHOT_MAX_AGE_MS,
  DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
} = await import('../packages/agent-browser/dist/screenshot-prune.js')

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

describe('browser screenshots prune', () => {
  it('env 0 disables the corresponding dimension; defaults otherwise', () => {
    assert.equal(
      resolveBrowserScreenshotMaxAgeMs(undefined, {}),
      DEFAULT_BROWSER_SCREENSHOT_MAX_AGE_MS,
    )
    assert.equal(
      resolveBrowserScreenshotMaxBytes(undefined, {}),
      DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
    )
    assert.equal(
      resolveBrowserScreenshotMaxAgeMs(undefined, { OPPTRIX_BROWSER_SCREENSHOT_MAX_AGE_MS: '0' }),
      0,
    )
    assert.equal(
      resolveBrowserScreenshotMaxBytes(undefined, { OPPTRIX_BROWSER_SCREENSHOT_MAX_BYTES: '0' }),
      0,
    )
    assert.equal(
      resolveBrowserScreenshotMaxAgeMs(undefined, { OPPTRIX_BROWSER_SCREENSHOT_MAX_AGE_MS: '3600000' }),
      3_600_000,
    )
    assert.equal(resolveBrowserScreenshotMaxAgeMs(1234, { OPPTRIX_BROWSER_SCREENSHOT_MAX_AGE_MS: '0' }), 1234)
  })

  it('TTL removes stale screenshots then capacity deletes oldest first', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'opptrix-browser-ss-'))
    try {
      const now = Date.now()
      const oldPath = join(dir, 'old.png')
      const midPath = join(dir, 'mid.png')
      const newPath = join(dir, 'new.png')

      await writeFile(oldPath, Buffer.alloc(100, 1))
      await writeFile(midPath, Buffer.alloc(100, 2))
      await writeFile(newPath, Buffer.alloc(100, 3))

      const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000)
      const recentMid = new Date(now - 120_000)
      const recentNew = new Date(now - 60_000)
      await utimes(oldPath, tenDaysAgo, tenDaysAgo)
      await utimes(midPath, recentMid, recentMid)
      await utimes(newPath, recentNew, recentNew)

      const ttlResult = await pruneBrowserScreenshots({
        screenshotDir: dir,
        maxAgeMs: DEFAULT_BROWSER_SCREENSHOT_MAX_AGE_MS,
        maxBytes: 10_000,
        nowMs: now,
      })
      assert.equal(ttlResult.removedFiles, 1)
      assert.equal(await exists(oldPath), false)
      assert.equal(await exists(midPath), true)
      assert.equal(await exists(newPath), true)

      const capResult = await pruneBrowserScreenshots({
        screenshotDir: dir,
        maxAgeMs: 0,
        maxBytes: 150,
        nowMs: now,
      })
      assert.ok(capResult.removedFiles >= 1)
      assert.equal(await exists(midPath), false)
      assert.equal(await exists(newPath), true)
      assert.ok(capResult.remainingBytes <= 150)

      const left = await readdir(dir)
      assert.deepEqual(left.sort(), ['new.png'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('maxAgeMs 0 and maxBytes 0 leave all files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'opptrix-browser-ss-off-'))
    try {
      const a = join(dir, 'a.png')
      await writeFile(a, Buffer.alloc(50, 9))
      const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      await utimes(a, old, old)

      const result = await pruneBrowserScreenshots({
        screenshotDir: dir,
        maxAgeMs: 0,
        maxBytes: 0,
        nowMs: Date.now(),
      })
      assert.equal(result.removedFiles, 0)
      assert.equal(await exists(a), true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
