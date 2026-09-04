import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

const ENFORCE_ENV = 'OPPTRIX_PLATFORM_PACK_ENFORCE'

describe('hands-port Wave 42A shell.platform (no-spawn)', () => {
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

  it('issue shell.platform → invoke returns platform + arch via gate.submit', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.shell.platform' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    assert.equal(issued.ticket.token, 'hands.shell.platform')
    assert.equal(ctx.hands.pendingCount(), 1)

    const before = ctx.meter.snapshot().submitCount
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ platform?: string, arch?: string }} */ (obs.data)
    assert.equal(data.platform, process.platform)
    assert.equal(data.arch, process.arch)
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)
    assert.equal(ctx.hands.pendingCount(), 0)

    const replay = await ctx.hands.invoke(issued.ticket)
    assert.equal(replay.ok, false)
    assert.equal(replay.denialCode, 'ticket_invalid')
  })

  it('free-form shell tokens rejected at issue', () => {
    const ctx = platform.createPlatformContext()
    for (const token of [
      'hands.shell.run',
      'hands.shell.command',
      'hands.shell.uname',
    ]) {
      const bad = ctx.hands.issue({ token, args: { command: 'echo hi' } })
      assert.equal(bad.ok, false, token)
      if (bad.ok) throw new Error(`expected fail for ${token}`)
      assert.match(bad.error, /unsupported hands token/)
    }
    assert.equal(ctx.hands.pendingCount(), 0)
  })

  it('C-HANDS-SHELL + ABI 0.8.52-thin-a', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.shell.platform' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ platform?: string, arch?: string }} */ (obs.data)
    assert.equal(data.platform, process.platform)
    assert.equal(data.arch, process.arch)

    // Wave 53A: restricted exec is allowlisted at issue (not free-form string command).
    const restricted = ctx.hands.issue({
      token: 'hands.shell.exec',
      args: { argv: ['uname'] },
    })
    assert.equal(restricted.ok, true)

    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
