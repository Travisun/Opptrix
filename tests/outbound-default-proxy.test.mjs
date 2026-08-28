/**
 * Process-default outbound proxy: inherit / force-direct / loopback bypass.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySystemProxyAsDefault,
  getDefaultOutboundProxyUrl,
  resetDefaultOutboundProxyUrlForTests,
  resolveEffectiveOutboundProxyUrl,
  setDefaultOutboundProxyUrl,
} from '@opptrix/shared'

const PROXY = 'http://127.0.0.1:7890'
const OTHER = 'socks5://127.0.0.1:1080'

describe('outbound default proxy', () => {
  beforeEach(() => {
    resetDefaultOutboundProxyUrlForTests()
  })

  afterEach(() => {
    resetDefaultOutboundProxyUrlForTests()
  })

  it('setDefaultOutboundProxyUrl stores a valid url and clears invalid/empty', () => {
    setDefaultOutboundProxyUrl(PROXY)
    assert.equal(getDefaultOutboundProxyUrl(), PROXY)
    setDefaultOutboundProxyUrl('not-a-proxy')
    assert.equal(getDefaultOutboundProxyUrl(), undefined)
    setDefaultOutboundProxyUrl(PROXY)
    setDefaultOutboundProxyUrl('')
    assert.equal(getDefaultOutboundProxyUrl(), undefined)
    setDefaultOutboundProxyUrl(PROXY)
    setDefaultOutboundProxyUrl(null)
    assert.equal(getDefaultOutboundProxyUrl(), undefined)
  })

  it('applySystemProxyAsDefault sets when enabled+valid and clears otherwise', () => {
    applySystemProxyAsDefault({ enabled: true, url: PROXY })
    assert.equal(getDefaultOutboundProxyUrl(), PROXY)
    applySystemProxyAsDefault({ enabled: true, url: 'ftp://nope' })
    assert.equal(getDefaultOutboundProxyUrl(), undefined)
    applySystemProxyAsDefault({ enabled: true, url: PROXY })
    applySystemProxyAsDefault({ enabled: false, url: PROXY })
    assert.equal(getDefaultOutboundProxyUrl(), undefined)
    applySystemProxyAsDefault(null)
    assert.equal(getDefaultOutboundProxyUrl(), undefined)
  })

  it('undefined init uses process default for remote hosts', () => {
    setDefaultOutboundProxyUrl(PROXY)
    assert.equal(
      resolveEffectiveOutboundProxyUrl({}, 'api.example.com'),
      PROXY,
    )
    assert.equal(
      resolveEffectiveOutboundProxyUrl({ proxyUrl: undefined }, 'api.example.com'),
      PROXY,
    )
  })

  it('proxyUrl false ignores process default', () => {
    setDefaultOutboundProxyUrl(PROXY)
    assert.equal(
      resolveEffectiveOutboundProxyUrl({ proxyUrl: false }, 'api.example.com'),
      undefined,
    )
  })

  it('explicit string overrides process default', () => {
    setDefaultOutboundProxyUrl(PROXY)
    assert.equal(
      resolveEffectiveOutboundProxyUrl({ proxyUrl: OTHER }, 'api.example.com'),
      OTHER,
    )
  })

  it('loopback hosts ignore process default', () => {
    setDefaultOutboundProxyUrl(PROXY)
    assert.equal(resolveEffectiveOutboundProxyUrl({}, 'localhost'), undefined)
    assert.equal(resolveEffectiveOutboundProxyUrl({}, '127.0.0.1'), undefined)
    assert.equal(resolveEffectiveOutboundProxyUrl({}, '::1'), undefined)
    assert.equal(resolveEffectiveOutboundProxyUrl({}, 'foo.localhost'), undefined)
  })

  it('explicit string on loopback still returns that string', () => {
    setDefaultOutboundProxyUrl(PROXY)
    assert.equal(
      resolveEffectiveOutboundProxyUrl({ proxyUrl: OTHER }, '127.0.0.1'),
      OTHER,
    )
    assert.equal(
      resolveEffectiveOutboundProxyUrl({ proxyUrl: OTHER }, 'localhost'),
      OTHER,
    )
  })

  it('invalid explicit string does not fall back to default', () => {
    setDefaultOutboundProxyUrl(PROXY)
    assert.equal(
      resolveEffectiveOutboundProxyUrl({ proxyUrl: 'ftp://bad' }, 'api.example.com'),
      undefined,
    )
  })
})
