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

describe('extension manifest register (Wave 38A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('registerFromManifest → list contains inactive metadata', () => {
    const ctx = platform.createPlatformContext()
    const reg = ctx.extensions.registerFromManifest({
      id: 'ext-w38',
      name: 'Wave38 Demo',
      version: '1.0.0',
      capabilities: ['quotes', 'news'],
    }, { trusted: true })
    assert.equal(reg.ok, true)

    const listed = ctx.extensions.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, 'ext-w38')
    assert.equal(listed[0]?.state, 'inactive')
    assert.equal(listed[0]?.name, 'Wave38 Demo')
    assert.equal(listed[0]?.version, '1.0.0')
    assert.deepEqual(listed[0]?.capabilities, ['quotes', 'news'])
    assert.equal(listed[0]?.trusted, true)
    assert.equal(ctx.info().extensionsActive, 0)
  })

  it('register without trust → trust_required (SF1)', () => {
    const ctx = platform.createPlatformContext()
    const noTrust = ctx.extensions.registerFromManifest({ id: 'ext-no-trust' })
    assert.equal(noTrust.ok, false)
    if (noTrust.ok) throw new Error('expected trust_required')
    assert.equal(noTrust.error, 'trust_required')
    assert.equal(ctx.extensions.list().length, 0)

    const viaRegister = ctx.extensions.register('ext-no-trust-2')
    assert.equal(viaRegister.ok, false)
    if (viaRegister.ok) throw new Error('expected trust_required')
    assert.equal(viaRegister.error, 'trust_required')
  })

  it('duplicate / empty id fails; register(id) still works', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.extensions.registerFromManifest({ id: '' }, { trusted: true }).ok, false)
    assert.equal(ctx.extensions.register('ext-id-only', { trusted: true }).ok, true)
    const dup = ctx.extensions.registerFromManifest({
      id: 'ext-id-only',
      name: 'again',
    }, { trusted: true })
    assert.equal(dup.ok, false)
    if (dup.ok) throw new Error('expected duplicate fail')
    assert.match(dup.error, /already registered/)
  })

  it('rejects file-path fields (no disk / code load)', () => {
    const ctx = platform.createPlatformContext()
    const withPath = ctx.extensions.registerFromManifest({
      id: 'ext-path',
      sourcePath: '/tmp/evil.js',
    }, { trusted: true })
    assert.equal(withPath.ok, false)
    if (withPath.ok) throw new Error('expected path reject')
    assert.match(withPath.error, /file path|sourcePath/i)
    assert.equal(ctx.extensions.list().length, 0)

    const withEntry = ctx.extensions.registerFromManifest({
      id: 'ext-entry',
      entry: './plugin.mjs',
    }, { trusted: true })
    assert.equal(withEntry.ok, false)
    assert.equal(ctx.extensions.list().length, 0)
  })

  it('admitRegisterExtension → list; custom origin; ABI 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitRegisterExtension(
      ctx,
      { trusted: true,
        id: 'ext-admit',
        name: 'Admit',
        version: '0.1.0',
        capabilities: ['scan'],
      },
      { origin: 'cli.diagnostic' },
    )
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.extension.id, 'ext-admit')
    assert.equal(result.extension.state, 'inactive')
    assert.equal(result.extension.name, 'Admit')
    assert.equal(result.extensions.length, 1)
    assert.equal(result.extensionsActive, 0)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('source has no eval/require/import of user code paths', () => {
    const src = fs.readFileSync(createMgrSrc, 'utf8')
    assert.doesNotMatch(src, /\beval\s*\(/)
    assert.doesNotMatch(src, /new\s+Function\s*\(/)
    // registerFromManifest must not dynamically import/require by path
    const fnSlice = src.slice(
      src.indexOf('function registerFromManifest'),
      src.indexOf('function registerFromManifest') + 1200,
    )
    assert.doesNotMatch(fnSlice, /\bimport\s*\(/)
    assert.doesNotMatch(fnSlice, /\brequire\s*\(/)
    assert.doesNotMatch(fnSlice, /\breadFile(?:Sync)?\s*\(/)
  })
})
