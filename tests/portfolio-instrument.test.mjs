import assert from 'node:assert/strict'
import test from 'node:test'
import {
  portfolioDisplayCode,
  portfolioLedgerKey,
  portfolioCodesMatch,
  portfolioInstrumentRef,
} from '../packages/a-stock-layer/dist/portfolio/instrument.js'

test('portfolioInstrumentRef — CN six-digit, HK five-digit, US ticker', () => {
  const cn = portfolioInstrumentRef('600519', 'CN')
  assert.equal(cn.market, 'CN')
  assert.equal(cn.symbol, '600519')

  const hk = portfolioInstrumentRef('700', 'HK')
  assert.equal(hk.market, 'HK')
  assert.equal(hk.symbol, '00700')

  const us = portfolioInstrumentRef('aapl', 'US')
  assert.equal(us.market, 'US')
  assert.equal(us.symbol, 'AAPL')
})

test('portfolioDisplayCode — no CN padStart bleed into HK/US', () => {
  assert.equal(portfolioDisplayCode('00700', 'HK'), '00700')
  assert.equal(portfolioDisplayCode('700', 'HK'), '00700')
  assert.equal(portfolioDisplayCode('AAPL', 'US'), 'AAPL')
  assert.equal(portfolioDisplayCode('600519', 'CN'), '600519')
  assert.equal(portfolioDisplayCode('519', 'CN'), '000519')
})

test('portfolioLedgerKey — distinct keys per market', () => {
  const cnKey = portfolioLedgerKey('600519', 'CN')
  const hkKey = portfolioLedgerKey('00700', 'HK')
  const usKey = portfolioLedgerKey('AAPL', 'US')
  assert.notEqual(cnKey, hkKey)
  assert.notEqual(cnKey, usKey)
  assert.notEqual(hkKey, usKey)
})

test('portfolioCodesMatch — aliases and legacy rows', () => {
  assert.ok(portfolioCodesMatch('00700', 'HK', '700', 'HK'))
  assert.ok(portfolioCodesMatch('600519', 'CN', '600519', 'CN'))
  assert.ok(portfolioCodesMatch('600519', undefined, '600519', 'CN'))
  assert.ok(!portfolioCodesMatch('00700', 'HK', 'AAPL', 'US'))
  assert.ok(!portfolioCodesMatch('00700', 'HK', '600519', 'CN'))
})
