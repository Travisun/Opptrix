import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const createMgrSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/create-extension-manager.ts',
)
const admitDeactivateSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/admit-deactivate-extension.ts',
)

describe('extension deactivate (Wave 40A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('register → activate → deactivate → inactive; catalog kept', async () => {
    const ctx = platform.createPlatformContext()
    const reg = ctx.extensions.registerFromManifest({
      id: 'ext-w40',
      name: 'Wave40 Demo',
      version: '1.0.0',
      capabilities: ['quotes'],
    }, { trusted: true })
    assert.equal(reg.ok, true)

    const act = await platform.admitActivateExtension(ctx, 'ext-w40')
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected activate ok')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.extensionsActive, 1)

    const deact = await platform.admitDeactivateExtension(ctx, 'ext-w40', {
      origin: 'cli.diagnostic',
    })
    assert.equal(deact.ok, true)
    if (!deact.ok) throw new Error('expected deactivate ok')
    assert.equal(deact.origin, 'cli.diagnostic')
    assert.ok(deact.traceId.length > 0)
    assert.equal(deact.extension.id, 'ext-w40')
    assert.equal(deact.extension.state, 'inactive')
    assert.equal(deact.extension.name, 'Wave40 Demo')
    assert.equal(deact.extensionsActive, 0)
    assert.equal(ctx.info().extensionsActive, 0)
    const listed = ctx.extensions.list().find((r) => r.id === 'ext-w40')
    assert.ok(listed)
    assert.equal(listed?.state, 'inactive')
    assert.equal(listed?.name, 'Wave40 Demo')
  })

  it('unknown id / empty id fails', async () => {
    const ctx = platform.createPlatformContext()
    const unknown = await platform.admitDeactivateExtension(ctx, 'no-such-ext')
    assert.equal(unknown.ok, false)
    if (unknown.ok) throw new Error('expected unknown fail')
    assert.match(unknown.error, /not found/)

    const empty = await platform.admitDeactivateExtension(ctx, '')
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected empty fail')
    assert.match(empty.error, /id required/)
    assert.equal(ctx.info().extensionsActive, 0)
  })

  it('C-EXT-DEACTIVATE + ABI 0.9.0-phase-a', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(
      ctx.extensions.registerFromManifest({ id: 'c-ext-deact' }, { trusted: true }).ok,
      true,
    )
    const act = await platform.admitActivateExtension(ctx, 'c-ext-deact')
    assert.equal(act.ok, true)
    const deact = await platform.admitDeactivateExtension(ctx, 'c-ext-deact')
    assert.equal(deact.ok, true)
    if (!deact.ok) throw new Error('expected ok')
    assert.equal(deact.extension.state, 'inactive')
    assert.equal(deact.extensionsActive, 0)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('deactivate path has no eval/import/readFile of extension code', () => {
    const mgr = fs.readFileSync(createMgrSrc, 'utf8')
    const admit = fs.readFileSync(admitDeactivateSrc, 'utf8')
    for (const src of [mgr, admit]) {
      assert.doesNotMatch(src, /\beval\s*\(/)
      assert.doesNotMatch(src, /new\s+Function\s*\(/)
    }
    const deactivateSlice = mgr.slice(
      mgr.indexOf('async deactivate'),
      mgr.indexOf('async deactivate') + 500,
    )
    assert.doesNotMatch(deactivateSlice, /\bimport\s*\(/)
    assert.doesNotMatch(deactivateSlice, /\brequire\s*\(/)
    assert.doesNotMatch(deactivateSlice, /\breadFile(?:Sync)?\s*\(/)
    assert.doesNotMatch(admit, /\bimport\s*\(/)
    assert.doesNotMatch(admit, /\breadFile(?:Sync)?\s*\(/)
  })
})
