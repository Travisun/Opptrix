import assert from 'node:assert/strict'
import { Capability } from '@opptrix/market-data-core'
import { TUSHARE_CAPS } from '../packages/a-stock-layer/dist/providers/tushare/manifest.js'
import { TUSHARE_CN_FUND_CAPABILITIES } from '../packages/a-stock-layer/dist/providers/tushare/fund-capabilities.js'
import { PROVIDER_FUND_COVERAGE } from '../packages/a-stock-layer/dist/providers/common/standard-methods.js'
import {
  fundTsCode,
  fundMarketFromTsCode,
  fundListMarketFromTsCode,
  fundTsCodeCandidates,
} from '../packages/a-stock-layer/dist/providers/tushare/codes.js'

assert.ok(TUSHARE_CAPS.includes(Capability.FUND_LIST), 'tushare registers FUND_LIST')
assert.ok(TUSHARE_CAPS.includes(Capability.FUND_NAV), 'tushare registers FUND_NAV')
assert.deepEqual(PROVIDER_FUND_COVERAGE.tushare, [
  'fundList',
  'fundProfile',
  'fundNav',
  'fundHoldings',
  'fundQuote',
])
assert.equal(fundTsCode('000001', 'PF'), '000001.OF')
assert.equal(fundTsCode('510330', 'PF'), '510330.SH')
assert.equal(fundTsCode('110022'), '110022.OF')
assert.equal(fundTsCode('510330'), '510330.SH')
assert.equal(fundMarketFromTsCode('000001.OF'), 'O')
assert.equal(fundMarketFromTsCode('510330.SH'), 'E')
assert.equal(fundListMarketFromTsCode('000001.OF'), 'PF')
assert.equal(fundListMarketFromTsCode('510330.SH'), 'SH')
assert.equal(TUSHARE_CN_FUND_CAPABILITIES.length, 5)
assert.ok(fundTsCodeCandidates('510330').includes('510330.SH'))
assert.ok(fundTsCodeCandidates('110022').includes('110022.OF'))

const { resolveCnPublicFundBareCode } = await import(
  '../packages/a-stock-layer/dist/core/fund-instrument.js',
)
assert.ok(resolveCnPublicFundBareCode('510330.SH') === '510330')
assert.ok(resolveCnPublicFundBareCode('110022.OF') === '110022')

const { wireProviderSymbolArg, wireRegistryMethodArgs } = await import(
  '../packages/a-stock-layer/dist/core/provider-wire.js',
)
const cnPublicFund = { market: 'CN', assetClass: 'FUND', symbol: '000001', exchange: 'PF' }
const cnListedFund = { market: 'CN', assetClass: 'FUND', symbol: '510330', exchange: 'PF' }

assert.equal(wireProviderSymbolArg('tushare', 'code', 'fundNav', cnPublicFund), '000001.OF')
assert.equal(wireProviderSymbolArg('tushare', 'code', 'fundNav', cnListedFund), '510330.SH')
assert.equal(
  wireProviderSymbolArg('tushare', 'code', 'profile', { market: 'CN', assetClass: 'ETF', symbol: '510330', exchange: 'SH' }),
  '510330.SH',
)
assert.equal(wireProviderSymbolArg('tushare', 'code', 'profile', { market: 'CN', assetClass: 'ETF', symbol: '510330', exchange: 'SH' }), '510330.SH')

const wiredList = wireRegistryMethodArgs('tushare', 'fundList', ['CN', '华夏'], cnPublicFund)
assert.deepEqual(wiredList, ['CN', '华夏'])

const { mapTushareFundNavRows } = await import(
  '../packages/a-stock-layer/dist/providers/tushare/normalize/fund.js',
)
const navRows = mapTushareFundNavRows('000001', [
  { end_date: '20240101', unit_nav: '1.0000', accum_nav: '1.0000' },
  { end_date: '20240102', unit_nav: '1.0100', accum_nav: '1.0100' },
])
assert.equal(navRows.length, 2)
assert.equal(navRows[0].date, '2024-01-02')
assert.ok(navRows[0].changePct != null && navRows[0].changePct > 0.99 && navRows[0].changePct < 1.01)
