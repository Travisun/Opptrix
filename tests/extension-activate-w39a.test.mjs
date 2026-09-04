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
const admitActivateSrc = path.join(
  here,
  '../apps/server/src/platform/extensions/admit-activate-extension.ts',
)

describe('extension activate (Wave 39A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('registerFromManifest → activate → active + extensionsActive', async () => {
    const ctx = platform.createPlatformContext()
    const reg = ctx.extensions.registerFromManifest({
      id: 'ext-w39',
      name: 'Wave39 Demo',
      version: '1.0.0',
      capabilities: ['quotes'],
    }, { trusted: true })
    assert.equal(reg.ok, true)
    assert.equal(ctx.info().extensionsActive, 0)

    const act = await platform.admitActivateExtension(ctx, 'ext-w39', {
      origin: 'cli.diagnostic',
    })
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected activate ok')
    assert.equal(act.origin, 'cli.diagnostic')
    assert.ok(act.traceId.length > 0)
    assert.equal(act.extension.id, 'ext-w39')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.extension.name, 'Wave39 Demo')
    assert.equal(act.extensionsActive, 1)
    assert.equal(ctx.info().extensionsActive, 1)
    assert.equal(
      ctx.extensions.list().find((r) => r.id === 'ext-w39')?.state,
      'active',
    )
  })

  it('unknown id / empty id fails', async () => {
    const ctx = platform.createPlatformContext()
    const unknown = await platform.admitActivateExtension(ctx, 'no-such-ext')
    assert.equal(unknown.ok, false)
    if (unknown.ok) throw new Error('expected unknown fail')
    assert.match(unknown.error, /not found/)

    const empty = await platform.admitActivateExtension(ctx, '')
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected empty fail')
    assert.match(empty.error, /id required/)
    assert.equal(ctx.info().extensionsActive, 0)
  })

  it('C-EXT-ACTIVATE + ABI 0.9.0-phase-a', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(
      ctx.extensions.registerFromManifest({ id: 'c-ext-act' }, { trusted: true }).ok,
      true,
    )
    const act = await platform.admitActivateExtension(ctx, 'c-ext-act')
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected ok')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.extensionsActive, 1)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('activate path has no eval/import/readFile of extension code', () => {
    const mgr = fs.readFileSync(createMgrSrc, 'utf8')
    const admit = fs.readFileSync(admitActivateSrc, 'utf8')
    for (const src of [mgr, admit]) {
      assert.doesNotMatch(src, /\beval\s*\(/)
      assert.doesNotMatch(src, /new\s+Function\s*\(/)
    }
    const activateSlice = mgr.slice(
      mgr.indexOf('async activate'),
      mgr.indexOf('async activate') + 800,
    )
    assert.doesNotMatch(activateSlice, /\bimport\s*\(/)
    assert.doesNotMatch(activateSlice, /\brequire\s*\(/)
    assert.doesNotMatch(activateSlice, /\breadFile(?:Sync)?\s*\(/)
    assert.doesNotMatch(admit, /\bimport\s*\(/)
    assert.doesNotMatch(admit, /\breadFile(?:Sync)?\s*\(/)
  })
})
