import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getConnectFamiliesForHost,
  isOutboundConnectError,
  initOutboundNetwork,
  noteHostConnectFailure,
  resetOutboundNetworkForTests,
  setOutboundNetworkStatusForTests,
} from '@opptrix/shared'

describe('outbound-network IPv4-first', () => {
  const originalFamily = process.env.OPPTRIX_OUTBOUND_FAMILY

  beforeEach(() => {
    resetOutboundNetworkForTests()
    delete process.env.OPPTRIX_OUTBOUND_FAMILY
  })

  afterEach(() => {
    resetOutboundNetworkForTests()
    if (originalFamily == null) delete process.env.OPPTRIX_OUTBOUND_FAMILY
    else process.env.OPPTRIX_OUTBOUND_FAMILY = originalFamily
  })

  it('defaults to IPv4 then IPv6 for all new hosts', () => {
    setOutboundNetworkStatusForTests()
    assert.deepEqual(getConnectFamiliesForHost('api.example.com'), [4, 6])
  })

  it('uses IPv4-first regardless of injected status', () => {
    setOutboundNetworkStatusForTests({ family: 4 })
    assert.deepEqual(getConnectFamiliesForHost('api.example.com'), [4, 6])
  })

  it('learns per-host family after failure', () => {
    setOutboundNetworkStatusForTests()
    noteHostConnectFailure('quote.eastmoney.com', 6)
    assert.deepEqual(getConnectFamiliesForHost('quote.eastmoney.com'), [4, 6])
    noteHostConnectFailure('only-v6.example', 4)
    assert.deepEqual(getConnectFamiliesForHost('only-v6.example'), [6, 4])
  })

  it('honors OPPTRIX_OUTBOUND_FAMILY override', () => {
    process.env.OPPTRIX_OUTBOUND_FAMILY = '6'
    setOutboundNetworkStatusForTests()
    assert.deepEqual(getConnectFamiliesForHost('any.host'), [6])
  })

  it('initOutboundNetwork is instant without external probe', async () => {
    const status = await initOutboundNetwork()
    assert.deepEqual(status, { family: 4 })
  })

  it('treats DNS and connect errors as retryable', () => {
    assert.equal(isOutboundConnectError(Object.assign(new Error('fail'), { code: 'ENOTFOUND' })), true)
    assert.equal(isOutboundConnectError(Object.assign(new Error('fail'), { code: 'EAI_AGAIN' })), true)
    assert.equal(isOutboundConnectError(new Error('getaddrinfo ENOTFOUND api.example.com')), true)
    assert.equal(isOutboundConnectError(Object.assign(new Error('aborted'), { name: 'AbortError' })), false)
    assert.equal(isOutboundConnectError(Object.assign(new Error('bad request'), { code: 'EINVAL' })), false)
  })
})
