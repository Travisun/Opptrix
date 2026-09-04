import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformPacks helper (Wave 22A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('admit lists research pack (enabled by default)', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformPacks(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(Array.isArray(result.packs))
    const research = result.packs.find((p) => p.id === 'research')
    assert.ok(research)
    assert.equal(research.enabled, true)
    assert.equal(typeof result.packEnforce, 'boolean')
    assert.equal(result.packEnforce, ctx.info().packEnforce)
  })

  it('enable coding true/false roundtrip via registry', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.packs.isEnabled('coding'), false)

    const on = platform.setPlatformPackEnabled(ctx, 'coding', true)
    assert.equal(on.ok, true)
    assert.equal(ctx.packs.isEnabled('coding'), true)

    const listed = platform.admitPlatformPacks(ctx)
    assert.equal(listed.ok, true)
    if (!listed.ok) throw new Error('expected ok')
    const coding = listed.packs.find((p) => p.id === 'coding')
    assert.ok(coding)
    assert.equal(coding.enabled, true)

    const off = platform.setPlatformPackEnabled(ctx, 'coding', false)
    assert.equal(off.ok, true)
    assert.equal(ctx.packs.isEnabled('coding'), false)
  })

  it('unsupported id fails', () => {
    const ctx = platform.createPlatformContext()
    const bad = platform.setPlatformPackEnabled(ctx, 'nope', true)
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.ok(typeof bad.error === 'string' && bad.error.length > 0)
    assert.equal(ctx.packs.isEnabled('coding'), false)
    assert.equal(ctx.packs.isEnabled('research'), true)
  })

  it('ABI is 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C4: pack enablement persists across createPackRegistry via preference', () => {
    platform.clearDomainPackPreferencesForTests()
    const first = platform.createPackRegistry()
    assert.equal(first.isEnabled('coding'), false)
    first.enable('coding', true)
    assert.equal(first.isEnabled('coding'), true)

    const second = platform.createPackRegistry()
    assert.equal(second.isEnabled('coding'), true)
    assert.equal(second.isEnabled('research'), true)

    second.enable('coding', false)
    const third = platform.createPackRegistry()
    assert.equal(third.isEnabled('coding'), false)

    platform.clearDomainPackPreferencesForTests()
    const fresh = platform.createPackRegistry()
    assert.equal(fresh.isEnabled('coding'), false)
    assert.equal(fresh.isEnabled('research'), true)
  })
})
