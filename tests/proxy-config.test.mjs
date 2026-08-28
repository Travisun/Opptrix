import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveEffectiveProxyUrl,
  isValidProxyUrl,
  validateProxyUrlInput,
  normalizeProviderProxyMode,
} from '@opptrix/shared'

describe('proxy-config', () => {
  it('validates http and socks proxy URLs', () => {
    assert.equal(isValidProxyUrl('http://127.0.0.1:7890'), true)
    assert.equal(isValidProxyUrl('https://proxy.local:8443'), true)
    assert.equal(isValidProxyUrl('socks5://127.0.0.1:1080'), true)
    assert.equal(isValidProxyUrl('socks4://127.0.0.1:1080'), true)
    assert.equal(isValidProxyUrl('ftp://127.0.0.1:21'), false)
    assert.equal(isValidProxyUrl('not-a-url'), false)
  })

  it('provider custom overrides system proxy', () => {
    const system = { enabled: true, url: 'http://127.0.0.1:7890' }
    const url = resolveEffectiveProxyUrl(
      { mode: 'custom', url: 'socks5://127.0.0.1:1080' },
      system,
    )
    assert.equal(url, 'socks5://127.0.0.1:1080')
  })

  it('provider none bypasses system proxy', () => {
    const system = { enabled: true, url: 'http://127.0.0.1:7890' }
    assert.equal(resolveEffectiveProxyUrl({ mode: 'none' }, system), undefined)
  })

  it('provider inherit uses system proxy when enabled', () => {
    const system = { enabled: true, url: 'http://127.0.0.1:7890' }
    assert.equal(
      resolveEffectiveProxyUrl({ mode: 'inherit' }, system),
      'http://127.0.0.1:7890',
    )
  })

  it('falls back to direct when system disabled and provider inherits', () => {
    assert.equal(
      resolveEffectiveProxyUrl({ mode: 'inherit' }, { enabled: false }),
      undefined,
    )
  })

  it('normalizeProviderProxyMode defaults to inherit', () => {
    assert.equal(normalizeProviderProxyMode(undefined), 'inherit')
    assert.equal(normalizeProviderProxyMode('bogus'), 'inherit')
  })

  it('validateProxyUrlInput rejects invalid schemes', () => {
    assert.throws(() => validateProxyUrlInput('ftp://x'), /代理地址/)
  })
})
