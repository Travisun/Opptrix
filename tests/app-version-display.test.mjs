/**
 * Runtime-over-base preference for health / Settings dual version display.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

before(async () => {
  su = await import('../packages/system-update/dist/index.js')
})

describe('resolveDisplayedAppVersions', () => {
  it('prefers hot runtime over baked app / base version', () => {
    const out = su.resolveDisplayedAppVersions({
      runtimeVersion: '1.4.6',
      hostBaseVersion: 'opptrix-selfhost-v1.4.5',
      appVersion: '1.4.5',
    })
    assert.equal(out.version, '1.4.6')
    assert.equal(out.runtimeVersion, '1.4.6')
    assert.equal(out.baseVersion, '1.4.5')
  })

  it('falls back to appVersion when runtime unset', () => {
    const out = su.resolveDisplayedAppVersions({
      runtimeVersion: null,
      hostBaseVersion: null,
      appVersion: '1.4.5',
    })
    assert.equal(out.version, '1.4.5')
    assert.equal(out.baseVersion, '1.4.5')
  })

  it('preferRuntimeAppVersion ignores blank runtime', () => {
    assert.equal(su.preferRuntimeAppVersion('  ', '1.4.5'), '1.4.5')
    assert.equal(su.preferRuntimeAppVersion('1.4.6', '1.4.5'), '1.4.6')
  })

  it('normalizeBaseVersionLabel strips selfhost tag prefix', () => {
    assert.equal(su.normalizeBaseVersionLabel('opptrix-selfhost-v1.4.5'), '1.4.5')
    assert.equal(su.normalizeBaseVersionLabel('v1.4.5'), '1.4.5')
    assert.equal(su.normalizeBaseVersionLabel(null), null)
  })
})
