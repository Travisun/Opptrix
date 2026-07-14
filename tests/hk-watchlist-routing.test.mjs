import test from 'node:test'
import assert from 'node:assert/strict'
import { MarketDataEngine } from '../packages/a-stock-layer/dist/engine.js'
import { Capability } from '../packages/a-stock-layer/dist/core/capabilities.js'
import { getProviderConfigStore } from '../packages/a-stock-layer/dist/providers/config-store.js'
import { getManifestRegistry } from '../packages/a-stock-layer/dist/providers/manifest-registry.js'
import { BUILTIN_PROVIDER_MANIFESTS } from '../packages/a-stock-layer/dist/providers/manifests.js'
import { liveNetworkTestsEnabled } from './helpers.mjs'

for (const manifest of BUILTIN_PROVIDER_MANIFESTS) {
  getManifestRegistry().register(manifest, 'builtin')
}

const store = getProviderConfigStore()
store.save('tencent', { enabled: true })
store.save('tickflow', { enabled: false })

const engine = new MarketDataEngine(false)
const { registerAllDrivers } = await import('../packages/a-stock-layer/dist/providers/register.js')
registerAllDrivers(engine.registry)

const LIVE = liveNetworkTestsEnabled()

test('tencent driver binds HK equity realtime capability', () => {
  const info = engine.registry.listDriverInfo().find(d => d.name === 'tencent')
  assert.ok(info)
  assert.ok(info.bindings.some(
    b => b.market === 'HK' && b.assetClass === 'EQUITY' && b.capability === Capability.STOCK_REALTIME,
  ))
})

test('HK watchlist quote works via tencent when tickflow disabled', {
  skip: !LIVE,
  timeout: 20_000,
}, async () => {
  const result = await engine.queryInstrumentData(
    { market: 'HK', assetClass: 'EQUITY', symbol: '00700' },
    'realtime',
  )
  assert.equal(result.success, true, result.error ?? 'expected success')
  assert.ok(result.data?.length, 'expected quote rows')
  assert.equal(result.source, 'tencent')
  assert.ok(result.data?.[0]?.price != null && result.data[0].price > 0)
  assert.ok(result.data?.[0]?.changePct != null)
})

test('HK snapshot loads quote and klines via tencent', {
  skip: !LIVE,
  timeout: 30_000,
}, async () => {
  const result = await engine.queryInstrumentData(
    { market: 'HK', assetClass: 'EQUITY', symbol: '00700' },
    'snapshot',
  )
  assert.equal(result.success, true, result.error ?? 'expected success')
  const data = result.data
  assert.ok(data?.quote?.price != null && data.quote.price > 0)
  assert.ok(Array.isArray(data?.recentKlines) && data.recentKlines.length > 0)
})
