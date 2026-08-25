/**
 * Hub fund_detail 聚合：快照失败整页失败；其余维度失败写入 failed，不拖垮主路径。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeFundDetailParts } from '../packages/research-hub/dist/index.js'

function ok(data) {
  return { success: true, data }
}

function fail(error = 'upstream') {
  return { success: false, error }
}

const snapshot = {
  code: '110022',
  profile: {
    name: '易方达消费行业',
    performance: { w52: 12.5 },
    holderAmount: 8000,
    instHolderRatio: 35,
  },
  nav: { nav: 2.1 },
  quote: null,
}

const emptyParts = {
  holdings: ok([]),
  returns: ok(null),
  drawdown: ok([]),
  allocation: ok(null),
  holders: ok(null),
  dividend: ok([]),
}

describe('mergeFundDetailParts', () => {
  it('snapshot 失败则整页失败', () => {
    const r = mergeFundDetailParts('110022', {
      snapshot: fail('timeout'),
      ...emptyParts,
    })
    assert.equal(r.success, false)
    assert.equal(r.data, null)
    assert.match(r.message, /暂时无法加载基金信息/)
  })

  it('holdings / returns 失败仍 success，failed 含对应标签', () => {
    const r = mergeFundDetailParts('110022', {
      snapshot: ok(snapshot),
      holdings: fail('holdings down'),
      returns: fail('returns down'),
      drawdown: fail('drawdown down'),
      allocation: fail('alloc down'),
      holders: fail('holders down'),
      dividend: fail('div down'),
    })
    assert.equal(r.success, true)
    assert.ok(r.data)
    assert.deepEqual(r.data.failed.sort(), ['分红', '持仓', '持有人', '回撤', '业绩', '配置'].sort())
    assert.equal(r.data.holdings.length, 0)
    assert.equal(r.data.returns?.performance?.w52, 12.5)
    assert.equal(r.data.holders?.holderAmount, 8000)
    assert.equal(r.data.dividends.length, 0)
  })

  it('snapshot 成功且各路有数据时不写 failed', () => {
    const r = mergeFundDetailParts('110022', {
      snapshot: ok(snapshot),
      holdings: ok([{ holdingSymbol: '600519', weight: 8 }]),
      returns: ok({ performance: { w4: 1.2 } }),
      drawdown: ok([{ period: 'w52', label: '近 1 年', value: -10 }]),
      allocation: ok({ assets: [{ name: '股票', ratio: 90 }], industries: [] }),
      holders: ok({ top: [{ name: '机构A', ratio: 5 }] }),
      dividend: ok([{ date: '2024-07-01', amount: 0.1 }]),
    })
    assert.equal(r.success, true)
    assert.deepEqual(r.data?.failed, [])
    assert.equal(r.data?.holdings.length, 1)
    assert.equal(r.data?.returns?.performance?.w4, 1.2)
    assert.equal(r.data?.drawdowns.length, 1)
    assert.equal(r.data?.allocation?.assets[0]?.name, '股票')
    assert.equal(r.data?.holders?.top[0]?.name, '机构A')
    assert.equal(r.data?.dividends.length, 1)
  })
})
