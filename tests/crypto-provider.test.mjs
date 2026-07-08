import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatCryptoKlineDate,
  matchesCryptoKeyword,
  resolveCryptoKlineInterval,
} from '../packages/a-stock-layer/dist/utils/crypto-kline.js'
import { defaultProviderEnabled } from '../packages/a-stock-layer/dist/providers/config-store.js'
import { getManifestRegistry } from '../packages/a-stock-layer/dist/providers/manifest-registry.js'
import { BUILTIN_PROVIDER_MANIFESTS } from '../packages/a-stock-layer/dist/providers/manifests.js'

for (const manifest of BUILTIN_PROVIDER_MANIFESTS) {
  getManifestRegistry().register(manifest, 'builtin')
}

test('resolveCryptoKlineInterval maps daily weekly and minute periods', () => {
  assert.deepEqual(resolveCryptoKlineInterval('daily'), {
    binance: '1d',
    okx: '1D',
    intraday: false,
  })
  assert.deepEqual(resolveCryptoKlineInterval('weekly'), {
    binance: '1w',
    okx: '1W',
    intraday: false,
  })
  assert.deepEqual(resolveCryptoKlineInterval('60m'), {
    binance: '1h',
    okx: '1H',
    intraday: true,
  })
  assert.equal(resolveCryptoKlineInterval('unknown'), null)
})

test('formatCryptoKlineDate keeps date-only for daily bars', () => {
  assert.equal(formatCryptoKlineDate('1704067200000', false), '2024-01-01')
})

test('formatCryptoKlineDate includes clock for intraday bars', () => {
  const formatted = formatCryptoKlineDate('1704067200000', true)
  assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
})

test('matchesCryptoKeyword filters by pair or base', () => {
  assert.equal(matchesCryptoKeyword('BTC/USDT', 'BTC', ''), true)
  assert.equal(matchesCryptoKeyword('ETH/USDT', 'ETH', 'btc'), false)
  assert.equal(matchesCryptoKeyword('BTC/USDT', 'BTC', 'btc'), true)
})

test('defaultProviderEnabled enables free providers and disables key-only providers', () => {
  assert.equal(defaultProviderEnabled('sinafinance'), true)
  assert.equal(defaultProviderEnabled('binance'), true)
  assert.equal(defaultProviderEnabled('okx'), true)
  assert.equal(defaultProviderEnabled('baostock'), true)
  assert.equal(defaultProviderEnabled('tushare'), false)
  assert.equal(defaultProviderEnabled('tickflow'), false)
  assert.equal(defaultProviderEnabled('tonghuashun'), false)
})
