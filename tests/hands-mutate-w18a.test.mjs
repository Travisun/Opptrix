import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

/** Minimal no-op stubs for unused adapter methods. */
function baseWorkspace(overrides = {}) {
  return {
    async listGrants() {
      return []
    },
    async listDir() {
      return { entries: [], path: '.' }
    },
    async readFile() {
      return { content: '', truncated: false, size: 0 }
    },
    async writeFile() {
      return { path: 'unused', bytes: 0 }
    },
    async mkdir() {
      return { path: 'unused' }
    },
    async deletePath() {
      return { deleted: 'unused' }
    },
    ...overrides,
  }
}

describe('hands-port Wave 18A mkdir + deletePath', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('issue mkdir → invoke returns path via adapter', async () => {
    /** @type {Array<{ sessionId: string, rootId: string, relPath: string }>} */
    const calls = []
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace({
        async mkdir(sessionId, rootId, relPath) {
          calls.push({ sessionId, rootId, relPath })
          return { path: relPath }
        },
      }),
    })

    const issued = hands.issue({
      token: 'hands.workspace.mkdir',
      args: {
        sessionId: 'sess-m',
        rootId: 'default',
        relPath: 'out/subdir',
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const before = platform.createPlatformContext().meter.snapshot().submitCount
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.sessionId, 'sess-m')
    assert.equal(calls[0]?.rootId, 'default')
    assert.equal(calls[0]?.relPath, 'out/subdir')
    const data = /** @type {{ path?: string }} */ (obs.data)
    assert.equal(data.path, 'out/subdir')
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(
      platform.createPlatformContext().meter.snapshot().submitCount,
      before + 1,
    )
  })

  it('deletePath with confirmDelete true → ok', async () => {
    /** @type {boolean | undefined} */
    let seenConfirm
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace({
        async deletePath(_sessionId, _rootId, relPath, opts) {
          seenConfirm = opts?.confirmDelete
          if (opts?.confirmDelete !== true) {
            const err = new Error('需要用户确认')
            err.name = 'ConfirmationRequiredError'
            throw err
          }
          return { deleted: relPath }
        },
      }),
    })

    const issued = hands.issue({
      token: 'hands.workspace.deletePath',
      args: {
        sessionId: 's1',
        rootId: 'default',
        relPath: 'gone.txt',
        confirmDelete: true,
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    assert.equal(seenConfirm, true)
    const data = /** @type {{ deleted?: string }} */ (obs.data)
    assert.equal(data.deleted, 'gone.txt')
  })

  it('deletePath without confirm → confirmation_required', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace({
        async deletePath(_sessionId, _rootId, _relPath, opts) {
          if (opts?.confirmDelete !== true) {
            const err = new Error('需要用户确认')
            err.name = 'ConfirmationRequiredError'
            throw err
          }
          return { deleted: 'x' }
        },
      }),
    })

    const issued = hands.issue({
      token: 'hands.workspace.deletePath',
      args: {
        sessionId: 's1',
        rootId: 'default',
        relPath: 'x.txt',
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, false)
    assert.equal(obs.denialCode, 'confirmation_required')
    assert.match(String(obs.error), /需要用户确认/)
  })

  it('mkdir/deletePath missing args → ok:false', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace(),
    })

    const noSessionMkdir = hands.issue({
      token: 'hands.workspace.mkdir',
      args: { rootId: 'default', relPath: 'd' },
    })
    assert.equal(noSessionMkdir.ok, true)
    if (!noSessionMkdir.ok) throw new Error('expected issue ok')
    const obsMkdir = await hands.invoke(noSessionMkdir.ticket)
    assert.equal(obsMkdir.ok, false)
    assert.match(String(obsMkdir.error), /sessionId required/)

    const noRelDelete = hands.issue({
      token: 'hands.workspace.deletePath',
      args: { sessionId: 's1', rootId: 'default' },
    })
    assert.equal(noRelDelete.ok, true)
    if (!noRelDelete.ok) throw new Error('expected issue ok')
    const obsDel = await hands.invoke(noRelDelete.ticket)
    assert.equal(obsDel.ok, false)
    assert.match(String(obsDel.error), /relPath required/)
  })

  it('unsupported token still rejected at issue', () => {
    const ctx = platform.createPlatformContext()
    const bad = ctx.hands.issue({ token: 'hands.shell.run' })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.match(bad.error, /unsupported hands token/)
  })
})
