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
  assert.equal(cn.assetClass, 'EQUITY')

  const cnEtf = portfolioInstrumentRef('510300', 'CN')
  assert.equal(cnEtf.market, 'CN')
  assert.equal(cnEtf.symbol, '510300')
  assert.equal(cnEtf.assetClass, 'ETF')

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

test('portfolioInstrumentRef — OTC fund namespace and .OF suffix', () => {
  const pf = portfolioInstrumentRef('CN:PF.009049')
  assert.equal(pf.market, 'CN')
  assert.equal(pf.assetClass, 'FUND')
  assert.equal(pf.exchange, 'PF')
  assert.equal(pf.symbol, '009049')

  const ofSuffix = portfolioInstrumentRef('009049.OF')
  assert.equal(ofSuffix.assetClass, 'FUND')
  assert.equal(ofSuffix.exchange, 'PF')
  assert.equal(ofSuffix.symbol, '009049')
})

test('portfolioDisplayCode — fund keeps CN:PF identity', () => {
  assert.equal(portfolioDisplayCode('CN:PF.009049'), 'CN:PF.009049')
  assert.equal(portfolioDisplayCode('009049.OF'), 'CN:PF.009049')
  assert.equal(portfolioDisplayCode('600519', 'CN'), '600519')
})

test('portfolioLedgerKey — distinct keys per market', () => {
  const cnKey = portfolioLedgerKey('600519', 'CN')
  const hkKey = portfolioLedgerKey('00700', 'HK')
  const usKey = portfolioLedgerKey('AAPL', 'US')
  assert.notEqual(cnKey, hkKey)
  assert.notEqual(cnKey, usKey)
  assert.notEqual(hkKey, usKey)
  assert.equal(portfolioLedgerKey('CN:PF.009049'), 'CN:PF.009049')
  assert.equal(portfolioLedgerKey('CN:OF.009049'), 'CN:PF.009049')
})

test('portfolioCodesMatch — aliases and legacy rows', () => {
  assert.ok(portfolioCodesMatch('00700', 'HK', '700', 'HK'))
  assert.ok(portfolioCodesMatch('600519', 'CN', '600519', 'CN'))
  assert.ok(portfolioCodesMatch('600519', undefined, '600519', 'CN'))
  assert.ok(!portfolioCodesMatch('00700', 'HK', 'AAPL', 'US'))
  assert.ok(!portfolioCodesMatch('00700', 'HK', '600519', 'CN'))
})

test('portfolioCodesMatch — FUND vs bare six-digit legacy ledger', () => {
  assert.ok(portfolioCodesMatch('CN:PF.009049', undefined, '009049', 'CN'))
  assert.ok(portfolioCodesMatch('009049', 'CN', 'CN:OF.009049', undefined))
  assert.ok(portfolioCodesMatch('009049.OF', undefined, '009049', 'CN'))
  // 显式交易所命名空间与场外基金不混配
  assert.ok(!portfolioCodesMatch('CN:PF.000001', undefined, 'CN:SZ.000001', undefined))
  assert.ok(!portfolioCodesMatch('CN:PF.009049', undefined, '600519', 'CN'))
})

test('portfolioInstrumentRef — explicit assetClass FUND/ETF not defaulted to EQUITY', () => {
  const fund = portfolioInstrumentRef('009049', 'CN', 'FUND')
  assert.equal(fund.assetClass, 'FUND')
  assert.equal(fund.exchange, 'PF')
  assert.equal(portfolioDisplayCode('009049', 'CN', 'FUND'), 'CN:PF.009049')
  assert.equal(portfolioLedgerKey('009049', 'CN', 'FUND'), 'CN:PF.009049')

  const etf = portfolioInstrumentRef('510300', 'CN', 'ETF')
  assert.equal(etf.assetClass, 'ETF')
  assert.notEqual(etf.assetClass, 'EQUITY')

  const fromRef = portfolioInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol: '110022',
    exchange: 'PF',
  })
  assert.equal(fromRef.assetClass, 'FUND')
  assert.equal(portfolioLedgerKey('110022', 'CN', 'FUND'), portfolioLedgerKey(fromRef.symbol, fromRef.market, fromRef.assetClass))
})

test('portfolioLedgerKey — US / HK equity refs', () => {
  const us = portfolioInstrumentRef('MSFT', 'US')
  assert.equal(us.market, 'US')
  assert.equal(us.assetClass, 'EQUITY')
  assert.ok(portfolioLedgerKey('MSFT', 'US').includes('US') || portfolioLedgerKey('MSFT', 'US') === 'US:MSFT' || portfolioLedgerKey('MSFT', 'US').startsWith('US'))

  const hk = portfolioInstrumentRef('00700', 'HK')
  assert.equal(hk.market, 'HK')
  assert.ok(portfolioLedgerKey('00700', 'HK'))
  assert.notEqual(portfolioLedgerKey('MSFT', 'US'), portfolioLedgerKey('00700', 'HK'))
})

test('portfolioCodesMatch — same fund with explicit assetClass on both sides', () => {
  assert.ok(portfolioCodesMatch('CN:PF.009049', 'CN', '009049', 'CN', 'FUND', 'FUND'))
  assert.ok(portfolioCodesMatch('CN:PF.009049', 'CN', 'CN:PF.009049', 'CN', 'FUND', 'FUND'))
})

test('portfolioCodesMatch — equity must not match fund bare code without fund side', () => {
  assert.ok(!portfolioCodesMatch('CN:PF.009049', 'CN', '600519', 'CN', 'FUND', 'EQUITY'))
  assert.ok(portfolioCodesMatch('CN:PF.009049', 'CN', '009049', 'CN', 'FUND', 'FUND'))
})

test('holdingMatchesRef semantics — FUND namespace must not match EQUITY same digits', async () => {
  const { instrumentRefKey } = await import('../packages/shared/dist/instrument-ref.js')
  const fund = portfolioInstrumentRef('009049', 'CN', 'FUND')
  const equity = portfolioInstrumentRef('009049', 'CN', 'EQUITY')
  assert.equal(fund.assetClass, 'FUND')
  assert.notEqual(instrumentRefKey(fund), instrumentRefKey(equity))
  // 持仓行带 assetClass=FUND 时，与个股 ref 不得匹配（与 holdingMatchesRef / instrumentKey 同语义）
  const holdingAsFund = portfolioInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol: '009049',
    exchange: 'PF',
  })
  assert.equal(instrumentRefKey(holdingAsFund), instrumentRefKey(fund))
  assert.notEqual(instrumentRefKey(holdingAsFund), instrumentRefKey(equity))
})

