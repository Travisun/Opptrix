import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INSTRUMENT_CAPABILITY_MATRIX,
  hasApplicationCapability,
  resolveInstrumentCapabilities,
} from '../packages/shared/dist/instrument-capabilities.js'

const ref = (market, assetClass, symbol = 'TEST') => ({ market, assetClass, symbol })

test('INSTRUMENT_CAPABILITY_MATRIX — row count and key market+assetClass pairs', () => {
  assert.equal(INSTRUMENT_CAPABILITY_MATRIX.length, 12)

  const keys = INSTRUMENT_CAPABILITY_MATRIX.map(row => `${row.market}:${row.assetClass}`)
  for (const key of [
    'CN:EQUITY',
    'CN:INDEX',
    'CN:ETF',
    'CN:FUND',
    'US:EQUITY',
    'US:ETF',
    'HK:EQUITY',
    'HK:ETF',
    'JP:EQUITY',
    'KR:EQUITY',
    'CRYPTO:CRYPTO_SPOT',
    'CRYPTO:CRYPTO_PERP',
  ]) {
    assert.ok(keys.includes(key), `missing matrix row ${key}`)
  }
})

test('US/HK ETF — portfolio_pnl enabled (aligned with EQUITY)', () => {
  assert.equal(hasApplicationCapability(ref('US', 'ETF', 'SPY'), 'portfolio_pnl'), true)
  assert.equal(hasApplicationCapability(ref('HK', 'ETF', '2800'), 'portfolio_pnl'), true)
  assert.equal(hasApplicationCapability(ref('US', 'ETF', 'SPY'), 'strategy_signal'), true)
  assert.equal(hasApplicationCapability(ref('HK', 'ETF', '2800'), 'technical_indicators'), true)
  assert.equal(hasApplicationCapability(ref('US', 'ETF', 'SPY'), 'discover_mine'), true)
})

test('JP/KR — no portfolio_pnl but discover_mine present', () => {
  for (const market of ['JP', 'KR']) {
    const r = ref(market, 'EQUITY', market === 'JP' ? '7203' : '005930')
    assert.equal(hasApplicationCapability(r, 'portfolio_pnl'), false)
    assert.equal(hasApplicationCapability(r, 'discover_mine'), true)
    assert.equal(hasApplicationCapability(r, 'quote'), true)
    assert.equal(hasApplicationCapability(r, 'snapshot'), true)
    assert.equal(hasApplicationCapability(r, 'chart_daily'), true)
  }
})

test('CRYPTO SPOT/PERP — no portfolio_pnl', () => {
  assert.equal(
    hasApplicationCapability(ref('CRYPTO', 'CRYPTO_SPOT', 'BTC/USDT'), 'portfolio_pnl'),
    false,
  )
  assert.equal(
    hasApplicationCapability(ref('CRYPTO', 'CRYPTO_PERP', 'BTC/USDT:USDT'), 'portfolio_pnl'),
    false,
  )
  assert.equal(
    hasApplicationCapability(ref('CRYPTO', 'CRYPTO_PERP', 'BTC/USDT:USDT'), 'discover_mine'),
    true,
  )
})

test('resolveInstrumentCapabilities fallback — ETF / PERP rows', () => {
  const usEtf = resolveInstrumentCapabilities(ref('US', 'ETF', 'QQQ'))
  assert.equal(usEtf.assetClass, 'ETF')
  assert.equal(usEtf.capabilities.includes('portfolio_pnl'), true)

  const hkEtf = resolveInstrumentCapabilities({ market: 'HK', assetClass: 'ETF', symbol: '3067' })
  assert.equal(hkEtf.assetClass, 'ETF')
  assert.equal(hkEtf.capabilities.includes('portfolio_pnl'), true)

  const perp = resolveInstrumentCapabilities(ref('CRYPTO', 'CRYPTO_PERP', 'ETH/USDT:USDT'))
  assert.equal(perp.assetClass, 'CRYPTO_PERP')
  assert.equal(perp.capabilities.includes('portfolio_pnl'), false)
  assert.equal(perp.capabilities.includes('strategy_signal'), true)
})
