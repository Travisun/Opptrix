import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('turn checkpoint hooks adapter (Wave 11A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('fake hooks counter + platform.checkpoint via server-shaped adapter', () => {
    const ctx = platform.createPlatformContext()
    /** @type {import('../packages/agent/dist/turn-checkpoint.js').TurnCheckpointSnapshot[]} */
    const seen = []

    /** @type {import('../packages/agent/dist/turn-checkpoint.js').TurnCheckpointHooks} */
    const hooks = {
      save(snapshot) {
        seen.push(snapshot)
        ctx.checkpoint.save(snapshot.sessionId, { ...snapshot })
      },
    }

    const sessionId = 'sess-w11a'
    hooks.save({
      phase: 'user',
      sessionId,
      title: 'hello',
      model: 'p:m',
      messageCount: 1,
      turnCount: 1,
      at: '2026-01-01T00:00:00.000Z',
    })
    hooks.save({
      phase: 'assistant',
      sessionId,
      title: 'hello',
      model: 'p:m',
      messageCount: 2,
      turnCount: 2,
      at: '2026-01-01T00:00:01.000Z',
    })

    assert.equal(seen.length, 2)
    assert.equal(seen[0]?.phase, 'user')
    assert.equal(seen[1]?.phase, 'assistant')

    const listed = ctx.checkpoint.list(sessionId)
    assert.equal(listed.length, 2)

    const p0 = ctx.checkpoint.get(listed[0].id)
    const p1 = ctx.checkpoint.get(listed[1].id)
    assert.equal(/** @type {{ phase?: string }} */ (p0)?.phase, 'user')
    assert.equal(/** @type {{ phase?: string }} */ (p1)?.phase, 'assistant')
    assert.equal(/** @type {{ messageCount?: number }} */ (p1)?.messageCount, 2)
  })

  it('hooks throw is isolatable (caller must swallow)', () => {
    /** @type {import('../packages/agent/dist/turn-checkpoint.js').TurnCheckpointHooks} */
    const hooks = {
      save() {
        throw new Error('checkpoint down')
      },
    }
    assert.throws(() => {
      hooks.save({
        phase: 'user',
        sessionId: 'x',
        messageCount: 0,
        turnCount: 0,
        at: new Date().toISOString(),
      })
    }, /checkpoint down/)
  })
})
