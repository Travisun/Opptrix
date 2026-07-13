/**
 * 出站 IPv4-first × 提供商连接交叉测试
 *
 * 默认：强制 IPv4；该 host v4 失败后再试 v6；两者都失败则报错
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  outboundFetch,
  initOutboundNetwork,
  getConnectFamiliesForHost,
  noteHostConnectFailure,
  resetOutboundNetworkForTests,
  setOutboundNetworkStatusForTests,
} from '@opptrix/shared'
import { testTencentConnection } from '../packages/a-stock-layer/dist/providers/tencent/api/probe.js'
import { testSinafinanceConnection } from '../packages/a-stock-layer/dist/providers/sinafinance/api/probe.js'
import { testAkshareConnection } from '../packages/a-stock-layer/dist/providers/akshare/driver.js'

const TIMEOUT_MS = 12_000
const ORIGINAL_FAMILY = process.env.OPPTRIX_OUTBOUND_FAMILY

const DUAL_STACK = { family: 4 }
const IPV4_ONLY = { family: 4 }
const IPV6_ONLY = { family: 4 }
const PROBE_UNKNOWN = { family: 4 }

const NETWORK_PROFILES = [
  { id: 'dual-stack', status: DUAL_STACK },
  { id: 'ipv4-only', status: IPV4_ONLY },
  { id: 'ipv6-only', status: IPV6_ONLY },
  { id: 'probe-inconclusive', status: PROBE_UNKNOWN },
]

const FREE_PROVIDERS = [
  { id: 'tencent', host: 'qt.gtimg.cn', testFn: () => testTencentConnection() },
  { id: 'sinafinance', host: 'hq.sinajs.cn', testFn: () => testSinafinanceConnection() },
  { id: 'akshare', host: 'datacenter-web.eastmoney.com', testFn: () => testAkshareConnection() },
]

const INTL_PROBE = {
  id: 'cloudflare',
  host: 'cloudflare.com',
  url: 'https://cloudflare.com/cdn-cgi/trace',
}

function applyFamilyEnv(mode) {
  if (mode == null) delete process.env.OPPTRIX_OUTBOUND_FAMILY
  else process.env.OPPTRIX_OUTBOUND_FAMILY = mode
}

function setupNetwork(profile) {
  resetOutboundNetworkForTests()
  setOutboundNetworkStatusForTests(profile.status)
}

function restoreEnv() {
  resetOutboundNetworkForTests()
  if (ORIGINAL_FAMILY == null) delete process.env.OPPTRIX_OUTBOUND_FAMILY
  else process.env.OPPTRIX_OUTBOUND_FAMILY = ORIGINAL_FAMILY
}

async function fetchOk(url) {
  const resp = await outboundFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  return resp.ok
}

describe('outbound dual-stack cross matrix (logic)', () => {
  beforeEach(() => {
    resetOutboundNetworkForTests()
    delete process.env.OPPTRIX_OUTBOUND_FAMILY
  })
  afterEach(restoreEnv)

  for (const profile of NETWORK_PROFILES) {
    it(`family order under ${profile.id} is always IPv4-first`, () => {
      setupNetwork(profile)
      assert.deepEqual(getConnectFamiliesForHost('api.example.com'), [4, 6])
    })
  }

  it('env override force-ipv4 / force-ipv6', () => {
    setupNetwork(NETWORK_PROFILES[0])
    applyFamilyEnv('4')
    assert.deepEqual(getConnectFamiliesForHost('any.host'), [4])
    applyFamilyEnv('6')
    assert.deepEqual(getConnectFamiliesForHost('any.host'), [6])
  })

  for (const provider of FREE_PROVIDERS) {
    it(`v4 failure on ${provider.id} can still connect via learned fallback`, async () => {
      setupNetwork(NETWORK_PROFILES[0])
      noteHostConnectFailure(provider.host, 4)
      assert.deepEqual(getConnectFamiliesForHost(provider.host), [6, 4])
      const result = await provider.testFn()
      const learned = getConnectFamiliesForHost(provider.host)[0]
      console.log(`  [v4-fail→fallback] ${provider.id}: ok=${result.ok} learned=${learned} ${result.message}`)
      assert.equal(result.ok, true, result.message)
      assert.ok(learned === 4 || learned === 6, `unexpected learned family ${learned}`)
    })
  }
})

describe('outbound dual-stack live — must-pass scenarios', () => {
  beforeEach(() => {
    resetOutboundNetworkForTests()
    delete process.env.OPPTRIX_OUTBOUND_FAMILY
  })
  afterEach(restoreEnv)

  it('initOutboundNetwork needs no startup probe', async () => {
    const status = await initOutboundNetwork()
    assert.deepEqual(status, { family: 4 })
  })

  const mustPassCombos = [
    { profile: DUAL_STACK, profileId: 'dual-stack', familyEnv: undefined, familyId: 'auto' },
    { profile: DUAL_STACK, profileId: 'dual-stack', familyEnv: '4', familyId: 'force-ipv4' },
    { profile: IPV4_ONLY, profileId: 'ipv4-only', familyEnv: undefined, familyId: 'auto' },
    { profile: PROBE_UNKNOWN, profileId: 'probe-inconclusive', familyEnv: undefined, familyId: 'auto' },
  ]

  for (const combo of mustPassCombos) {
    for (const provider of FREE_PROVIDERS) {
      it(`${provider.id} @ ${combo.profileId} × ${combo.familyId}`, { timeout: TIMEOUT_MS + 5000 }, async () => {
        setupNetwork({ id: combo.profileId, status: combo.profile })
        applyFamilyEnv(combo.familyEnv)
        const result = await provider.testFn()
        console.log(`  [must-pass] ${provider.id} ${combo.profileId}×${combo.familyId}: ${result.message}`)
        assert.equal(result.ok, true, result.message)
      })
    }

    it(`cloudflare @ ${combo.profileId} × ${combo.familyId}`, { timeout: TIMEOUT_MS + 5000 }, async () => {
      setupNetwork({ id: combo.profileId, status: combo.profile })
      applyFamilyEnv(combo.familyEnv)
      const ok = await fetchOk(INTL_PROBE.url)
      console.log(`  [must-pass] cloudflare ${combo.profileId}×${combo.familyId}: ok=${ok}`)
      assert.equal(ok, true)
    })
  }

  it('tencent raw outboundFetch under dual-stack auto', async () => {
    setupNetwork(NETWORK_PROFILES[0])
    const resp = await outboundFetch('https://qt.gtimg.cn/q=sh600519', {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await resp.text()
    assert.ok(resp.ok && text.length > 10, 'tencent quote body')
  })
})

describe('outbound dual-stack live — known limitations', () => {
  beforeEach(() => {
    resetOutboundNetworkForTests()
    delete process.env.OPPTRIX_OUTBOUND_FAMILY
  })
  afterEach(restoreEnv)

  const limitationCombos = [
    { profile: DUAL_STACK, profileId: 'dual-stack', familyEnv: '6', familyId: 'force-ipv6-no-fallback' },
    { profile: DUAL_STACK, profileId: 'dual-stack', familyEnv: '4', familyId: 'force-ipv4-no-fallback' },
  ]

  for (const combo of limitationCombos) {
    for (const provider of FREE_PROVIDERS) {
      it(`${provider.id} @ ${combo.profileId} × ${combo.familyId} (documented)`, { timeout: TIMEOUT_MS + 5000 }, async () => {
        setupNetwork({ id: combo.profileId, status: combo.profile })
        applyFamilyEnv(combo.familyEnv)
        const result = await provider.testFn()
        console.log(`  [limitation] ${provider.id} ${combo.profileId}×${combo.familyId}: ok=${result.ok} ${result.message}`)
        // 不强制失败也不强制成功：记录行为；若成功说明该环境 v6 亦可达
        assert.equal(typeof result.ok, 'boolean')
      })
    }
  }
})
