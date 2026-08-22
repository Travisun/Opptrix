/**
 * 公募基金标准码（CN:PF）→ 查询计划 → provider-wire → Driver 全链路测试
 * 覆盖场外（O）与场内（E：SH/SZ）
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInstrumentNamespace,
  normalizeInstrumentRef,
  parseInstrumentNamespace,
} from '@opptrix/shared'
import { resolveInstrumentQueryPlan } from '@opptrix/a-stock-layer'

/** 标准 CN:PF 样例 — 场外开放式 + 场内 SH ETF + 场内 SZ ETF/LOF */
const STANDARD_FUND_CASES = [
  {
    label: '场外开放式',
    namespace: 'CN:PF.110022',
    symbol: '110022',
    venue: 'O',
    tushareWire: '110022.OF',
    sinaWire: '110022',
    tushareNavTsCode: '110022.OF',
  },
  {
    label: '场内 SH',
    namespace: 'CN:PF.510330',
    symbol: '510330',
    venue: 'E',
    listing: 'SH',
    tushareWire: '510330.SH',
    sinaWire: '510330',
    tushareNavTsCode: '510330.SH',
  },
  {
    label: '场内 SZ',
    namespace: 'CN:PF.159915',
    symbol: '159915',
    venue: 'E',
    listing: 'SZ',
    tushareWire: '159915.SZ',
    sinaWire: '159915',
    tushareNavTsCode: '159915.SZ',
  },
]

const FUND_REGISTRY_METHODS = [
  { capability: 'fund_profile', method: 'fundProfile' },
  { capability: 'fund_nav', method: 'fundNav' },
  { capability: 'fund_quote', method: 'fundQuote' },
  { capability: 'fund_holdings', method: 'fundHoldings' },
]

test('CN:PF 标准命名空间 — 场内外解析与规范化', () => {
  for (const c of STANDARD_FUND_CASES) {
    const ref = parseInstrumentNamespace(c.namespace)
    assert.ok(ref, c.label)
    assert.equal(ref.market, 'CN', c.label)
    assert.equal(ref.assetClass, 'FUND', c.label)
    assert.equal(ref.symbol, c.symbol, c.label)
    assert.equal(ref.exchange, 'PF', c.label)
    assert.equal(buildInstrumentNamespace(ref), c.namespace, c.label)

    const legacy = parseInstrumentNamespace(c.namespace.replace('CN:PF', 'CN:OF'))
    assert.ok(legacy, `${c.label} legacy OF`)
    assert.equal(buildInstrumentNamespace(legacy), c.namespace, `${c.label} legacy canonical`)
  }
})

test('resolveInstrumentQueryPlan — 标准 CN:PF 路由至 fund_* registry', () => {
  for (const c of STANDARD_FUND_CASES) {
    const ref = parseInstrumentNamespace(c.namespace)
    for (const { capability, method } of FUND_REGISTRY_METHODS) {
      const plan = resolveInstrumentQueryPlan(ref, capability)
      assert.ok(plan, `${c.label} ${capability}`)
      assert.equal(plan?.kind, 'registry', `${c.label} ${capability}`)
      if (plan?.kind === 'registry') {
        assert.equal(plan.method, method, `${c.label} ${method}`)
        assert.equal(plan.assetClass, 'FUND', `${c.label} ${method}`)
        assert.equal(plan.ref?.symbol, c.symbol, `${c.label} ${method} ref`)
        assert.equal(plan.args[0], c.symbol, `${c.label} ${method} pre-wire arg`)
      }
    }
  }
})

test('provider-wire — tushare / sinafinance 场内外标准码', async () => {
  const { wireProviderSymbolArg, wireRegistryMethodArgs } = await import(
    '../packages/a-stock-layer/dist/core/provider-wire.js',
  )

  for (const c of STANDARD_FUND_CASES) {
    const ref = parseInstrumentNamespace(c.namespace)

    assert.equal(
      wireProviderSymbolArg('tushare', 'code', 'fundNav', ref),
      c.tushareWire,
      `${c.label} tushare wireProviderSymbolArg`,
    )
    assert.equal(
      wireProviderSymbolArg('sinafinance', 'code', 'fundNav', ref),
      c.sinaWire,
      `${c.label} sinafinance wireProviderSymbolArg`,
    )

    for (const { method } of FUND_REGISTRY_METHODS) {
      const tArgs = wireRegistryMethodArgs('tushare', method, [c.symbol], ref)
      assert.equal(tArgs[0], c.tushareWire, `${c.label} tushare ${method}`)

      const sArgs = wireRegistryMethodArgs('sinafinance', method, [c.symbol], ref)
      assert.equal(sArgs[0], c.sinaWire, `${c.label} sinafinance ${method}`)
    }
  }
})

test('resolveCnPublicFundBareCode — 标准后缀输入', async () => {
  const { resolveCnPublicFundBareCode } = await import(
    '../packages/a-stock-layer/dist/core/fund-instrument.js',
  )

  assert.equal(resolveCnPublicFundBareCode('CN:PF.110022'), '110022')
  assert.equal(resolveCnPublicFundBareCode('110022.OF'), '110022')
  assert.equal(resolveCnPublicFundBareCode('510330.SH'), '510330')
  assert.equal(resolveCnPublicFundBareCode('159915.SZ'), '159915')
})

test('fundTsCode — 场内外自动识别', async () => {
  const { fundTsCode, fundTsCodeCandidates, fundListMarketFromTsCode } = await import(
    '../packages/a-stock-layer/dist/providers/tushare/codes.js',
  )

  assert.equal(fundTsCode('110022'), '110022.OF')
  assert.equal(fundTsCode('510330'), '510330.SH')
  assert.equal(fundTsCode('159915'), '159915.SZ')
  assert.equal(fundListMarketFromTsCode('110022.OF'), 'PF')
  assert.equal(fundListMarketFromTsCode('510330.SH'), 'SH')
  assert.equal(fundListMarketFromTsCode('159915.SZ'), 'SZ')

  assert.ok(fundTsCodeCandidates('110022').includes('110022.OF'))
  assert.ok(fundTsCodeCandidates('510330').includes('510330.SH'))
  assert.ok(fundTsCodeCandidates('159915').includes('159915.SZ'))
})

test('Provider 门禁 — CN:PF FUND ref', async () => {
  const { tushareFundGate } = await import(
    '../packages/a-stock-layer/dist/providers/tushare/markets/cn/fund.js',
  )
  const { sinafinanceFundGate } = await import(
    '../packages/a-stock-layer/dist/providers/sinafinance/markets/cn/fund.js',
  )

  for (const c of STANDARD_FUND_CASES) {
    const ref = parseInstrumentNamespace(c.namespace)
    assert.equal(tushareFundGate(ref), true, c.label)
    assert.equal(sinafinanceFundGate(ref), true, c.label)
  }

  const etfRef = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'ETF',
    symbol: '510300',
    exchange: 'SH',
  })
  assert.equal(tushareFundGate(etfRef), false)
  assert.equal(sinafinanceFundGate(etfRef), false)
})

function createTushareFundProto() {
  const proto = {}
  return import('../packages/a-stock-layer/dist/providers/tushare/markets/cn/fund.js').then(({ mixTushareFund }) => {
    mixTushareFund({ prototype: proto })
    return proto
  })
}

function createMockTushareClient(navByTsCode) {
  return {
    query: async () => [],
    queryAll: async (api, params) => {
      const ts = String(params?.ts_code ?? '')
      if (api === 'fund_nav') return navByTsCode[ts] ?? []
      if (api === 'fund_portfolio') return []
      if (api === 'fund_basic') return []
      return []
    },
  }
}

test('Tushare Driver fundNav — 场外标准码命中 OF ts_code', async () => {
  const proto = await createTushareFundProto()
  const navRow = { end_date: '20240102', unit_nav: '1.0100', accum_nav: '1.0100' }
  const client = createMockTushareClient({ '110022.OF': [navRow] })
  const handler = { client: () => client }

  const rows = await proto.fundNav.call(handler, '110022')
  assert.ok(rows?.length, '场外 fundNav 应返回数据')
  assert.equal(rows[0].code, '110022')
  assert.equal(rows[0].date, '2024-01-02')
})

test('Tushare Driver fundNav — 场内 SH 标准码', async () => {
  const proto = await createTushareFundProto()
  const navRow = { end_date: '20240301', unit_nav: '4.5000', accum_nav: '4.5000' }
  const client = createMockTushareClient({ '510330.SH': [navRow] })
  const handler = { client: () => client }

  const rows = await proto.fundNav.call(handler, '510330')
  assert.ok(rows?.length, '场内 SH fundNav 应返回数据')
  assert.equal(rows[0].code, '510330')
})

test('Tushare Driver fundNav — 场内 SZ 标准码', async () => {
  const proto = await createTushareFundProto()
  const navRow = { end_date: '20240301', unit_nav: '2.1000', accum_nav: '2.1000' }
  const client = createMockTushareClient({ '159915.SZ': [navRow] })
  const handler = { client: () => client }

  const rows = await proto.fundNav.call(handler, '159915')
  assert.ok(rows?.length, '场内 SZ fundNav 应返回数据')
  assert.equal(rows[0].code, '159915')
})

test('Tushare Driver fundNav — wired 后缀输入', async () => {
  const proto = await createTushareFundProto()
  const navRow = { end_date: '20240102', unit_nav: '1.0100', accum_nav: '1.0100' }
  const client = createMockTushareClient({ '110022.OF': [navRow] })
  const handler = { client: () => client }

  const rows = await proto.fundNav.call(handler, '110022.OF')
  assert.ok(rows?.length, '带 .OF 后缀应解析并返回')
})

test('Tushare Driver fundProfile — 场外 resolveFundBasic + 净值', async () => {
  const proto = await createTushareFundProto()
  const basic = {
    ts_code: '110022.OF',
    name: '易方达消费行业',
    fund_type: '股票型',
    market: 'O',
  }
  const navRow = { end_date: '20240102', unit_nav: '3.50', accum_nav: '3.50' }
  const client = {
    query: async (api, params) => {
      if (api === 'fund_basic' && params.ts_code === '110022.OF') return [basic]
      return []
    },
    queryAll: async (api, params) => {
      if (api === 'fund_nav' && params.ts_code === '110022.OF') return [navRow]
      return []
    },
  }
  const handler = { client: () => client }

  const rows = await proto.fundProfile.call(handler, '110022')
  assert.ok(rows?.length, '场外 fundProfile 应返回档案')
  assert.equal(rows[0].code, '110022')
  assert.ok(String(rows[0].name ?? '').length > 0)
})

test('Tushare Driver fundProfile — 场内 SH 回退候选', async () => {
  const proto = await createTushareFundProto()
  const basic = {
    ts_code: '510330.SH',
    name: '华夏沪深300ETF',
    fund_type: 'ETF',
    market: 'E',
  }
  const client = {
    query: async (api, params) => {
      if (api === 'fund_basic' && params.ts_code === '510330.SH') return [basic]
      return []
    },
    queryAll: async (api, params) => {
      if (api === 'fund_nav' && params.ts_code === '510330.SH') {
        return [{ end_date: '20240301', unit_nav: '4.5', accum_nav: '4.5' }]
      }
      return []
    },
  }
  const handler = { client: () => client }

  const rows = await proto.fundProfile.call(handler, '510330')
  assert.ok(rows?.length, '场内 SH fundProfile 应返回档案')
  assert.equal(rows[0].code, '510330')
})

test('sinafinance 行情键 — 场内外 resolveMarket 前缀', async () => {
  const { resolveMarket } = await import('../packages/a-stock-layer/dist/utils/helpers.js')

  assert.equal(resolveMarket('110022'), 'SZ')
  assert.equal(resolveMarket('510330'), 'SH')
  assert.equal(resolveMarket('159915'), 'SZ')

  const hqKeys = (bare) => {
    const prefix = resolveMarket(bare) === 'SH' ? 'sh' : 'sz'
    return [`of${bare}`, `f_${bare}`, `${prefix}${bare}`]
  }

  assert.deepEqual(hqKeys('110022'), ['of110022', 'f_110022', 'sz110022'])
  assert.deepEqual(hqKeys('510330'), ['of510330', 'f_510330', 'sh510330'])
  assert.deepEqual(hqKeys('159915'), ['of159915', 'f_159915', 'sz159915'])
})

test('PROVIDER_FUND_COVERAGE — tushare 与 sinafinance 五件套', async () => {
  const { PROVIDER_FUND_COVERAGE } = await import(
    '../packages/a-stock-layer/dist/providers/common/standard-methods.js',
  )
  const expected = ['fundList', 'fundProfile', 'fundNav', 'fundHoldings', 'fundQuote']
  assert.deepEqual(PROVIDER_FUND_COVERAGE.tushare, expected)
  assert.deepEqual(PROVIDER_FUND_COVERAGE.sinafinance, expected)
})
