import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('hands-port Wave 14A readFile', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('issue readFile → invoke returns file data via adapter', async () => {
    /** @type {{ sessionId: string, rootId: string, relPath: string }[]} */
    const calls = []
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile(sessionId, rootId, relPath) {
          calls.push({ sessionId, rootId, relPath })
          return {
            content: 'hello hands',
            truncated: false,
            size: 11,
          }
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
      },
    })

    const issued = hands.issue({
      token: 'hands.workspace.readFile',
      args: {
        sessionId: 'sess-r',
        rootId: 'default',
        relPath: 'notes/a.txt',
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const before = platform.createPlatformContext().meter.snapshot().submitCount
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    assert.deepEqual(calls, [
      { sessionId: 'sess-r', rootId: 'default', relPath: 'notes/a.txt' },
    ])
    const data = /** @type {{ content?: string, truncated?: boolean, size?: number }} */ (
      obs.data
    )
    assert.equal(data.content, 'hello hands')
    assert.equal(data.truncated, false)
    assert.equal(data.size, 11)
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(
      platform.createPlatformContext().meter.snapshot().submitCount,
      before + 1,
    )
  })

  it('readFile WorkspaceError → HandsObservation ok:false', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile() {
          const err = new Error('文件不存在')
          err.name = 'WorkspaceError'
          throw err
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
      },
    })

    const issued = hands.issue({
      token: 'hands.workspace.readFile',
      args: { sessionId: 's1', rootId: 'default', relPath: 'gone.txt' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, false)
    assert.match(String(obs.error), /文件不存在/)
  })

  it('readFile missing args → ok:false', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile() {
          return { content: 'x', truncated: false, size: 1 }
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
      },
    })

    const noRel = hands.issue({
      token: 'hands.workspace.readFile',
      args: { sessionId: 's1', rootId: 'default', relPath: '   ' },
    })
    assert.equal(noRel.ok, true)
    if (!noRel.ok) throw new Error('expected issue ok')
    const obsRel = await hands.invoke(noRel.ticket)
    assert.equal(obsRel.ok, false)
    assert.match(String(obsRel.error), /relPath required/)

    const noRoot = hands.issue({
      token: 'hands.workspace.readFile',
      args: { sessionId: 's1', relPath: 'a.txt' },
    })
    assert.equal(noRoot.ok, true)
    if (!noRoot.ok) throw new Error('expected issue ok')
    const obsRoot = await hands.invoke(noRoot.ticket)
    assert.equal(obsRoot.ok, false)
    assert.match(String(obsRoot.error), /rootId required/)

    const noSession = hands.issue({
      token: 'hands.workspace.readFile',
      args: { rootId: 'default', relPath: 'a.txt' },
    })
    assert.equal(noSession.ok, true)
    if (!noSession.ok) throw new Error('expected issue ok')
    const obsSession = await hands.invoke(noSession.ticket)
    assert.equal(obsSession.ok, false)
    assert.match(String(obsSession.error), /sessionId required/)
  })
})
