import {
  resolveStockSecId,
  resolveStockMarketCode,
} from '../dist/utils/helpers.js'
import { toTdxSymbol } from '../dist/tdx/symbol.js'

const cases = [
  { code: '600519', market: 'SH', expect: '1.600519', label: '沪市主板' },
  { code: '000001', market: 'SZ', expect: '0.000001', label: '深市平安银行' },
  { code: '000001', market: null, expect: '0.000001', label: '000001默认按深市个股' },
  { code: '000001', market: 'SH', expect: '1.000001', label: '上证指数(显式)' },
  { code: '000002', market: null, expect: '0.000002', label: '深市主板' },
  { code: '002594', market: null, expect: '0.002594', label: '中小板' },
  { code: '300750', market: null, expect: '0.300750', label: '创业板' },
  { code: '399006', market: null, expect: '0.399006', label: '创业板指' },
  { code: '000300', market: null, expect: '1.000300', label: '沪深300指数' },
  { code: '920002', market: 'BJ', expect: '3.920002', label: '北交所920' },
  { code: '430047', market: 'BJ', expect: '0.430047', label: '北交所旧码' },
]

let failed = 0
for (const row of cases) {
  const got = resolveStockSecId(row.code, row.market)
  if (got !== row.expect) {
    failed += 1
    console.error(`FAIL ${row.label}: ${row.code} market=${row.market} => ${got}, want ${row.expect}`)
  } else {
    console.log(`OK   ${row.label}: ${got}`)
  }
}

const marketCases = [
  ['600519', 'SH'],
  ['000001', 'SZ'],
  ['300750', 'SZ'],
  ['920002', 'BJ'],
  ['000300', 'SH'],
]
for (const [code, want] of marketCases) {
  const got = resolveStockMarketCode(code)
  if (got !== want) {
    failed += 1
    console.error(`FAIL market ${code}: ${got}, want ${want}`)
  }
}

const tdxCases = [
  ['600519', null, 'SH.600519'],
  ['000001', null, 'SZ.000001'],
  ['000002', null, 'SZ.000002'],
  ['000300', null, 'SH.000300'],
  ['920002', null, 'BJ.920002'],
]
for (const [code, market, want] of tdxCases) {
  const got = toTdxSymbol(code, market)
  if (got !== want) {
    failed += 1
    console.error(`FAIL tdx ${code}: ${got}, want ${want}`)
  }
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll stock secid tests passed')
