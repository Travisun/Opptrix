import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

const ENFORCE_ENV = 'OPPTRIX_PLATFORM_PACK_ENFORCE'

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

describe('hands-port Wave 17A writeFile', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  /** @type {string | undefined} */
  let prevEnforceEnv

  beforeEach(async () => {
    prevEnforceEnv = process.env[ENFORCE_ENV]
    // Hands tokens map to coding pack; isolate from SF1 packEnforce default ON.
    process.env[ENFORCE_ENV] = '0'
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
    // hands.* → coding pack; enable so packEnforce ON cannot deny invoke
    platform.createPlatformContext().packs.enable('coding', true)
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
    if (prevEnforceEnv === undefined) {
      delete process.env[ENFORCE_ENV]
    } else {
      process.env[ENFORCE_ENV] = prevEnforceEnv
    }
  })

  it('issue writeFile → invoke returns path/bytes via adapter', async () => {
    /** @type {Array<{ sessionId: string, rootId: string, relPath: string, content: string }>} */
    const calls = []
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace({
        async writeFile(sessionId, rootId, relPath, content) {
          calls.push({ sessionId, rootId, relPath, content })
          return { path: relPath, bytes: Buffer.byteLength(content, 'utf8') }
        },
      }),
    })

    const issued = hands.issue({
      token: 'hands.workspace.writeFile',
      args: {
        sessionId: 'sess-w',
        rootId: 'default',
        relPath: 'out/a.txt',
        content: 'hello write',
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const before = platform.createPlatformContext().meter.snapshot().submitCount
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.sessionId, 'sess-w')
    assert.equal(calls[0]?.rootId, 'default')
    assert.equal(calls[0]?.relPath, 'out/a.txt')
    assert.equal(calls[0]?.content, 'hello write')
    const data = /** @type {{ path?: string, bytes?: number }} */ (obs.data)
    assert.equal(data.path, 'out/a.txt')
    assert.equal(data.bytes, Buffer.byteLength('hello write', 'utf8'))
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(
      platform.createPlatformContext().meter.snapshot().submitCount,
      before + 1,
    )
  })

  it('writeFile missing content/sessionId → ok:false', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace(),
    })

    const noContent = hands.issue({
      token: 'hands.workspace.writeFile',
      args: { sessionId: 's1', rootId: 'default', relPath: 'a.txt' },
    })
    assert.equal(noContent.ok, true)
    if (!noContent.ok) throw new Error('expected issue ok')
    const obsContent = await hands.invoke(noContent.ticket)
    assert.equal(obsContent.ok, false)
    assert.match(String(obsContent.error), /content required/)

    const noSession = hands.issue({
      token: 'hands.workspace.writeFile',
      args: { rootId: 'default', relPath: 'a.txt', content: 'x' },
    })
    assert.equal(noSession.ok, true)
    if (!noSession.ok) throw new Error('expected issue ok')
    const obsSession = await hands.invoke(noSession.ticket)
    assert.equal(obsSession.ok, false)
    assert.match(String(obsSession.error), /sessionId required/)
  })

  it('unsupported token still rejected at issue', () => {
    const ctx = platform.createPlatformContext()
    const bad = ctx.hands.issue({ token: 'hands.shell.run' })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.match(bad.error, /unsupported hands token/)
  })

  it('overwrite succeeds without confirmOverwrite (thin-A)', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace({
        async writeFile(_sessionId, _rootId, relPath, content) {
          return { path: relPath, bytes: Buffer.byteLength(content, 'utf8') }
        },
      }),
    })

    const issued = hands.issue({
      token: 'hands.workspace.writeFile',
      args: {
        sessionId: 's1',
        rootId: 'default',
        relPath: 'x.txt',
        content: 'overwrite',
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ path?: string, bytes?: number }} */ (obs.data)
    assert.equal(data.path, 'x.txt')
    assert.equal(data.bytes, Buffer.byteLength('overwrite', 'utf8'))
  })

  it('confirmOverwrite legacy arg ignored — still succeeds', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: baseWorkspace({
        async writeFile(_sessionId, _rootId, relPath, content) {
          return { path: relPath, bytes: Buffer.byteLength(content, 'utf8') }
        },
      }),
    })

    const issued = hands.issue({
      token: 'hands.workspace.writeFile',
      args: {
        sessionId: 's1',
        rootId: 'default',
        relPath: 'x.txt',
        content: 'ok',
        confirmOverwrite: true,
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ path?: string, bytes?: number }} */ (obs.data)
    assert.equal(data.path, 'x.txt')
    assert.equal(data.bytes, 2)
  })
})
