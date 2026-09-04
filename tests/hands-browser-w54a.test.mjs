import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

const ENFORCE_ENV = 'OPPTRIX_PLATFORM_PACK_ENFORCE'

describe('hands-port Wave 54A browser detect (no-launch)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  /** @type {string | undefined} */
  let prevEnforceEnv

  beforeEach(async () => {
    prevEnforceEnv = process.env[ENFORCE_ENV]
    process.env[ENFORCE_ENV] = '0'
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
    // hands.* → coding pack; enable so packEnforce ON cannot deny invoke
    platform.createPlatformContext().packs.enable('coding', true)
    platform.resetBrowserDetectCacheForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
    platform.resetBrowserDetectCacheForTests()
    if (prevEnforceEnv === undefined) {
      delete process.env[ENFORCE_ENV]
    } else {
      process.env[ENFORCE_ENV] = prevEnforceEnv
    }
  })

  it('injected browserDetect → capabilities returns package_present', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      browserDetect: () => ({
        available: true,
        engine: 'agent-browser',
        reason: 'package_present',
      }),
    })
    const issued = hands.issue({ token: 'hands.browser.capabilities' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const before = platform.createPlatformContext().meter.snapshot().submitCount
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ available?: boolean, engine?: string, reason?: string }} */ (
      obs.data
    )
    assert.equal(data.available, true)
    assert.equal(data.engine, 'agent-browser')
    assert.equal(data.reason, 'package_present')
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(
      platform.createPlatformContext().meter.snapshot().submitCount,
      before + 1,
    )
  })

  it('injected package_missing + ping share probe shape', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      browserDetect: () => ({
        available: false,
        engine: 'none',
        reason: 'package_missing',
      }),
    })
    for (const token of ['hands.browser.capabilities', 'hands.browser.ping']) {
      const issued = hands.issue({ token })
      assert.equal(issued.ok, true, token)
      if (!issued.ok) throw new Error(`expected issue ok for ${token}`)
      const obs = await hands.invoke(issued.ticket)
      assert.equal(obs.ok, true, token)
      if (!obs.ok) throw new Error(`expected invoke ok for ${token}`)
      const data = /** @type {{ available?: boolean, engine?: string, reason?: string }} */ (
        obs.data
      )
      assert.equal(data.available, false)
      assert.equal(data.engine, 'none')
      assert.equal(data.reason, 'package_missing')
    }
  })

  it('default detect on platform context → package_present (agent-browser dep)', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.browser.capabilities' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ available?: boolean, engine?: string, reason?: string }} */ (
      obs.data
    )
    assert.equal(data.available, true)
    assert.equal(data.engine, 'agent-browser')
    assert.equal(data.reason, 'package_present')
  })

  it('free-form browser tokens rejected at issue (navigate allowed Wave 57A)', () => {
    const ctx = platform.createPlatformContext()
    for (const token of [
      'hands.browser.goto',
      'hands.browser.screenshot',
      'hands.browser.click',
      'hands.browser.type',
    ]) {
      const bad = ctx.hands.issue({ token, args: { url: 'https://example.com' } })
      assert.equal(bad.ok, false, token)
      if (bad.ok) throw new Error(`expected fail for ${token}`)
      assert.match(bad.error, /unsupported hands token/)
    }
    assert.equal(ctx.hands.pendingCount(), 0)

    const nav = ctx.hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'https://example.com' },
    })
    assert.equal(nav.ok, true)
  })

  it('C-HANDS-BROWSER + ABI 0.9.0-phase-a', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.browser.capabilities' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ available?: boolean, engine?: string, reason?: string }} */ (
      obs.data
    )
    assert.equal(data.available, true)
    assert.equal(data.engine, 'agent-browser')
    assert.equal(data.reason, 'package_present')

    const screenshot = ctx.hands.issue({
      token: 'hands.browser.screenshot',
      args: { url: 'https://example.com' },
    })
    assert.equal(screenshot.ok, false)

    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })
})
