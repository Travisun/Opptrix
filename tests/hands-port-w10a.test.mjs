import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('hands-port Wave 10A', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('issue ping → invoke → pong; ticket is one-shot', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.ping' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    assert.equal(issued.ticket.token, 'hands.ping')
    assert.equal(issued.ticket.principal.kind, 'system')
    assert.equal(issued.ticket.principal.id, 'hands')
    assert.equal(ctx.hands.pendingCount(), 1)
    assert.equal(ctx.info().handsTicketsPending, 1)

    const before = ctx.meter.snapshot().submitCount
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ pong?: boolean, at?: string }} */ (obs.data)
    assert.equal(data.pong, true)
    assert.equal(typeof data.at, 'string')
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)
    assert.equal(ctx.hands.pendingCount(), 0)
    assert.equal(ctx.info().handsTicketsPending, 0)

    const replay = await ctx.hands.invoke(issued.ticket)
    assert.equal(replay.ok, false)
    assert.equal(replay.denialCode, 'ticket_invalid')
  })

  it('expired ticket fails with ticket_expired', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.ping', ttlMs: 1 })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    await new Promise((r) => setTimeout(r, 5))
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, false)
    assert.equal(obs.denialCode, 'ticket_expired')
    assert.equal(ctx.hands.pendingCount(), 0)
  })

  it('unsupported token fails at issue', () => {
    const ctx = platform.createPlatformContext()
    const bad = ctx.hands.issue({ token: 'hands.shell.write' })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.match(bad.error, /unsupported hands token/)
    assert.equal(ctx.hands.pendingCount(), 0)
  })

  it('empty token fails at issue', () => {
    const ctx = platform.createPlatformContext()
    const bad = ctx.hands.issue({ token: '   ' })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.match(bad.error, /token required/)
  })

  it('listGrants via injected workspace adapter', async () => {
    /** @type {{ sessionId: string }[]} */
    const calls = []
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: {
        async listGrants(sessionId) {
          calls.push({ sessionId })
          return [
            {
              id: 'g1',
              root_id: 'default',
              abs_path: '/tmp/ws',
              mode: 'rw',
              is_default: true,
            },
          ]
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
      },
    })

    const issued = hands.issue({
      token: 'hands.workspace.listGrants',
      args: { sessionId: 'sess-hands' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    assert.deepEqual(calls, [{ sessionId: 'sess-hands' }])
    const grants = /** @type {Array<{ root_id?: string }>} */ (obs.data)
    assert.ok(Array.isArray(grants))
    assert.equal(grants[0]?.root_id, 'default')
  })

  it('listDir workspace error → HandsObservation ok:false', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          const err = new Error('未知 root_id: missing')
          err.name = 'WorkspaceError'
          throw err
        },
        async readFile() {
          return { content: '', truncated: false, size: 0 }
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
      },
    })

    const issued = hands.issue({
      token: 'hands.workspace.listDir',
      args: { sessionId: 's1', rootId: 'missing' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, false)
    assert.match(String(obs.error), /未知 root_id/)
  })

  it('listGrants missing sessionId → ok:false', async () => {
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
          return { content: '', truncated: false, size: 0 }
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
      },
    })
    const issued = hands.issue({
      token: 'hands.workspace.listGrants',
      args: {},
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, false)
    assert.match(String(obs.error), /sessionId required/)
  })
})
