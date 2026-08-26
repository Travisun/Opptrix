/**
 * Hub fund_detail 聚合：快照失败整页失败；持仓/配置失败写入 failed，不拖垮主路径。
 * 业绩与持有人结构由 snapshot.profile 派生，不再单独并行 fund_returns / fund_holders。
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
    ranks: { w52: { rank: 10, total: 200 } },
    peerAvg: { w52: 8.1 },
    holderAmount: 8000,
    instHolderRatio: 35,
  },
  nav: { nav: 2.1 },
  quote: null,
}

const emptyParts = {
  holdings: ok([]),
  allocation: ok(null),
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

  it('holdings / allocation 失败仍 success，failed 含对应标签；业绩与持有人来自 profile', () => {
    const r = mergeFundDetailParts('110022', {
      snapshot: ok(snapshot),
      holdings: fail('holdings down'),
      allocation: fail('alloc down'),
    })
    assert.equal(r.success, true)
    assert.ok(r.data)
    assert.deepEqual(
      r.data.failed.sort(),
      ['持仓', '配置'].sort(),
    )
    assert.equal(r.data.holdings.length, 0)
    assert.equal(r.data.returns?.performance?.w52, 12.5)
    assert.equal(r.data.returns?.ranks?.w52?.rank, 10)
    assert.equal(r.data.returns?.peerAvg?.w52, 8.1)
    assert.equal(r.data.holders?.holderAmount, 8000)
    assert.deepEqual(r.data.holders?.top, [])
    assert.equal(r.data.dividends.length, 0)
    assert.equal(r.data.manager, null)
    assert.equal(r.data.drawdowns.length, 0)
    assert.equal(r.data.diagnosis, null)
    assert.equal(r.data.news.length, 0)
    assert.equal(r.data.financials, null)
  })

  it('snapshot 成功且各路有数据时不写 failed', () => {
    const r = mergeFundDetailParts('110022', {
      snapshot: ok(snapshot),
      holdings: ok([{ holdingSymbol: '600519', weight: 8 }]),
      allocation: ok({ assets: [{ name: '股票', ratio: 90 }], industries: [] }),
    })
    assert.equal(r.success, true)
    assert.deepEqual(r.data?.failed, [])
    assert.equal(r.data?.holdings.length, 1)
    assert.equal(r.data?.returns?.performance?.w52, 12.5)
    assert.equal(r.data?.drawdowns.length, 0)
    assert.equal(r.data?.allocation?.assets[0]?.name, '股票')
    assert.equal(r.data?.holders?.holderAmount, 8000)
    assert.equal(r.data?.dividends.length, 0)
    assert.equal(r.data?.manager, null)
    assert.equal(r.data?.diagnosis, null)
    assert.equal(r.data?.news.length, 0)
    assert.equal(r.data?.financials, null)
  })

  it('profile 无业绩与持有人时 returns / holders 为 null', () => {
    const r = mergeFundDetailParts('110022', {
      snapshot: ok({ code: '110022', profile: { name: '测试' }, nav: null, quote: null }),
      ...emptyParts,
    })
    assert.equal(r.success, true)
    assert.equal(r.data?.returns, null)
    assert.equal(r.data?.holders, null)
    assert.deepEqual(r.data?.failed, [])
  })
})
