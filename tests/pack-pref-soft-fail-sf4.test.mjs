import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getUserDataStore } from '@opptrix/user-store'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('pack preference write soft-fail (SF4)', { concurrency: false }, () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform
  /** @type {((namespace: string, id: string, data: unknown) => void) | null} */
  let origSetDocument = null

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
    platform.clearDomainPackPreferencesForTests()
  })

  afterEach(() => {
    if (origSetDocument) {
      getUserDataStore().setDocument = origSetDocument
      origSetDocument = null
    }
    platform.clearDomainPackPreferencesForTests()
    platform.resetPlatformContextForTests()
  })

  it('enable keeps in-memory when preference write throws; returns persisted:false', () => {
    const store = getUserDataStore()
    origSetDocument = store.setDocument.bind(store)
    store.setDocument = (namespace, id, data) => {
      if (namespace === 'preference' && id === platform.PLATFORM_DOMAIN_PACKS_PREF_KEY) {
        throw new Error('simulated preference write failure')
      }
      return origSetDocument(namespace, id, data)
    }

    const reg = platform.createPackRegistry()
    const result = reg.enable('coding', true)
    assert.equal(result.persisted, false)
    assert.ok(typeof result.error === 'string' && result.error.length > 0)
    // In-memory must stay enabled — do not clear on soft fail.
    assert.equal(reg.isEnabled('coding'), true)
    const coding = reg.list().find((p) => p.id === 'coding')
    assert.ok(coding)
    assert.equal(coding.enabled, true)
  })

  it('setPlatformPackEnabled returns ok:false + packs on soft persist fail', () => {
    const store = getUserDataStore()
    origSetDocument = store.setDocument.bind(store)
    store.setDocument = (namespace, id, data) => {
      if (namespace === 'preference' && id === platform.PLATFORM_DOMAIN_PACKS_PREF_KEY) {
        throw new Error('disk full')
      }
      return origSetDocument(namespace, id, data)
    }

    const ctx = platform.createPlatformContext()
    const setResult = platform.setPlatformPackEnabled(ctx, 'coding', true)
    assert.equal(setResult.ok, false)
    assert.equal(setResult.persisted, false)
    assert.ok(typeof setResult.error === 'string')
    assert.equal(ctx.packs.isEnabled('coding'), true)
    const coding = setResult.packs.find((p) => p.id === 'coding')
    assert.ok(coding)
    assert.equal(coding.enabled, true)
  })

  it('ABI is 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })
})
