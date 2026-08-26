import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCnListedFundSymbol, isCnLofSymbol } from '../packages/a-stock-layer/dist/core/fund-instrument.js'
import { resolveFuyaoFundRoute } from '../packages/a-stock-layer/dist/providers/tonghuashun/api/fund-symbols.js'
import {
  FuyaoApiError,
  FuyaoClient,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/api/client.js'
import {
  FUYAO_FUND_NAV_RECENT_OPTS,
  FUYAO_FUND_NAV_SERIES_OPTS,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/markets/cn/fund.js'
import {
  mapFundAllocationRow,
  mapFundDividendRows,
  mapFundDrawdownRows,
  mapFundDrawdownFromResilience,
  parseFundResilienceItems,
  mapFundHoldersRow,
  mapFundHoldingsToFundRows,
  mapFundNavRowsForFund,
  mapFundProfileToFundProfileRow,
  mapFundReturnsDetail,
  mapFundReturnsToPerformance,
  mapFundRateInfo,
  mapFundManagerRow,
  formatManagerGender,
  mapFundDiagnosisRow,
  mapFundNewsRows,
  mapFundFinancialsRow,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/normalize/fund.js'

describe('cn lof instrument', () => {
  it('isCnLofSymbol distinguishes LOF from 159 ETF segment', () => {
    assert.equal(isCnLofSymbol('161725'), true)
    assert.equal(isCnLofSymbol('160216'), true)
    assert.equal(isCnLofSymbol('159915'), false)
    assert.equal(isCnLofSymbol('510300'), false)
    assert.equal(isCnListedFundSymbol('161725'), true)
    assert.equal(isCnListedFundSymbol('159915'), true)
  })
})

describe('fuyao fund profile', () => {
  it('resolveFuyaoFundRoute maps REIT to reits with listed suffix', () => {
    assert.deepEqual(
      resolveFuyaoFundRoute('180102.SZ', { assetClass: 'REIT' }),
      { fundType: 'reits', thscode: '180102.SZ' },
    )
  })

  it('resolveFuyaoFundRoute maps OTC and exchange codes', () => {
    assert.deepEqual(resolveFuyaoFundRoute('009049'), { fundType: 'otc', thscode: '009049.OF' })
    assert.deepEqual(resolveFuyaoFundRoute('515150'), { fundType: 'exchange', thscode: '515150.SH' })
    assert.deepEqual(resolveFuyaoFundRoute('161725'), { fundType: 'exchange', thscode: '161725.SZ' })
    assert.deepEqual(resolveFuyaoFundRoute('025480.OF'), { fundType: 'otc', thscode: '025480.OF' })
  })

  it('fundNav / profile / quote pass documented range + nav_type', () => {
    // fundNav：五年序列（侧边栏走势）；不传 range 时扶摇最多 1 条
    assert.equal(FUYAO_FUND_NAV_SERIES_OPTS.range, 'fyear')
    assert.equal(FUYAO_FUND_NAV_SERIES_OPTS.nav_type, 'unit,adj')
    // profile / quote：近月序列以便 latest+prev 算 changePct
    assert.equal(FUYAO_FUND_NAV_RECENT_OPTS.range, 'month')
    assert.equal(FUYAO_FUND_NAV_RECENT_OPTS.nav_type, 'unit,adj')
  })

  it('mapFundReturnsToPerformance maps return_year to w52', () => {
    const perf = mapFundReturnsToPerformance({ return_year: 12.5, return_month: 1.2 })
    assert.equal(perf?.w52, 12.5)
    assert.equal(perf?.w4, 1.2)
  })

  it('mapFundProfileToFundProfileRow merges nav and returns', () => {
    const row = mapFundProfileToFundProfileRow('009049', {
      fund_name: '测试基金',
      full_name: '测试基金全称',
      manager_name: '张三',
      manager_id: 'mgr-001',
      mgmt_name: '测试公司',
      mgmt_id: 'co-9',
      fund_scale: 5e9,
      total_shares: 1.2e9,
      risk_level: '中风险',
      invest_philosophy: '长期价值',
      invest_strategy: '精选个股',
      estab_date: 1609459200000,
      rate_info: [
        { rate_type: '管理费', standard_rate: 1.2 },
        { rate_type: '托管费', standard_rate: 0.2 },
        { rate_name: '销售服务费', rate: 0.4 },
      ],
      purchase_fee: 1.5,
      redeem_fee: 0.5,
    }, {
      navItems: [
        { nav_date: 1752595200000, unit_nav: 1.01, adj_nav: 1.15 },
        { nav_date: 1752508800000, unit_nav: 1.0, adj_nav: 1.14 },
      ],
      returns: { return_year: 8.5, rank_year: 12, rank_total_year: 300, peer_average_year: 6.2 },
    })
    assert.equal(row.code, '009049')
    assert.equal(row.name, '测试基金')
    assert.equal(row.fullName, '测试基金全称')
    assert.equal(row.managerId, 'mgr-001')
    assert.equal(row.companyId, 'co-9')
    assert.equal(row.riskLevel, '中风险')
    assert.equal(row.totalShares, 1.2e9)
    assert.equal(row.investPhilosophy, '长期价值')
    assert.equal(row.investStrategy, '精选个股')
    assert.equal(row.unitNav, 1.01)
    // adj_nav → accNav（复权净值口径，非累计净值）
    assert.equal(row.accNav, 1.15)
    assert.equal(row.changePct != null && Math.abs(row.changePct - 1) < 1e-6, true)
    assert.equal(row.return1y, 8.5)
    assert.equal(row.ranks?.w52?.rank, 12)
    assert.equal(row.ranks?.w52?.total, 300)
    assert.equal(row.peerAvg?.w52, 6.2)
    assert.equal(row.scale, 50)
    assert.equal(row.expenseRatio, 1.2)
    assert.equal(row.purchaseFee, 1.5)
    assert.equal(row.redeemFee, 0.5)
    assert.equal(row.establishDate, '2021-01-01')
    assert.equal(row.rateInfo?.length, 3)
    assert.equal(row.rateInfo?.[1]?.label, '托管费')
    assert.equal(row.rateInfo?.[1]?.name, '托管费')
    assert.equal(row.rateInfo?.[1]?.rate, 0.2)
  })

  it('mapFundHoldingsToFundRows normalizes portfolio holdings', () => {
    const rows = mapFundHoldingsToFundRows('009049', [
      {
        ticker: '300750',
        stock_name: '宁德时代',
        hold_ratio: 4.67,
        asset_type: 'stock',
        end_date_ms: 1785513600000,
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].holdingSymbol, '300750')
    assert.equal(rows[0].holdingName, '宁德时代')
    assert.equal(rows[0].weight, 4.67)
    assert.equal(rows[0].source, 'tonghuashun')
  })

  it('mapFundNavRowsForFund maps multi-day series with daily change', () => {
    const rows = mapFundNavRowsForFund('009049', [
      { nav_date: 1752508800000, unit_nav: 1.0, adj_nav: 1.1 },
      { nav_date: 1752595200000, unit_nav: 1.02, adj_nav: 1.12 },
      { nav_date: 1752681600000, unit_nav: 1.03, adj_nav: 1.13 },
    ])
    assert.equal(rows.length, 3)
    assert.equal(rows[0].changePct, null)
    assert.equal(rows[1].changePct != null && Math.abs(rows[1].changePct - 2) < 1e-6, true)
    assert.equal(rows[2].nav, 1.03)
    assert.equal(rows[2].accNav, 1.13)
  })

  it('mapFundReturnsToPerformance maps year2 / year5', () => {
    const perf = mapFundReturnsToPerformance({
      return_twoyear: 20,
      return_fyear: 80,
      return_year: 10,
    })
    assert.equal(perf?.year2, 20)
    assert.equal(perf?.year5, 80)
    assert.equal(perf?.w52, 10)
  })

  it('mapFundReturnsDetail maps ranks with official peer_average / rank_total', () => {
    const row = mapFundReturnsDetail('009049', {
      return_year: 12.5,
      peer_average_year: 9.1,
      rank_year: 23,
      rank_total_year: 520,
    })
    assert.equal(row.performance?.w52, 12.5)
    assert.equal(row.peerAvg?.w52, 9.1)
    assert.equal(row.ranks?.w52?.rank, 23)
    assert.equal(row.ranks?.w52?.total, 520)
  })

  it('mapFundReturnsDetail falls back to avg_return / count_* aliases', () => {
    const row = mapFundReturnsDetail('009049', {
      return_year: 12.5,
      avg_return_year: 8.2,
      rank_year: 23,
      count_year: 400,
    })
    assert.equal(row.peerAvg?.w52, 8.2)
    assert.equal(row.ranks?.w52?.total, 400)
  })

  it('mapFundReturnsDetail maps ranks', () => {
    const row = mapFundReturnsDetail('009049', {
      return_year: 12.5,
      rank_year: 23,
      count_year: 400,
    })
    assert.equal(row.performance?.w52, 12.5)
    assert.equal(row.ranks?.w52?.rank, 23)
    assert.equal(row.ranks?.w52?.total, 400)
  })

  it('mapFundDrawdownRows maps a single-object blob', () => {
    const rows = mapFundDrawdownRows('009049', [{
      drawdown_year: -18.2,
      drawdown_month: -3.1,
    }])
    assert.ok(rows.some(r => r.period === 'w52' && r.value === -18.2))
    assert.ok(rows.some(r => r.period === 'w4' && r.value === -3.1))
  })

  it('mapFundDrawdownRows maps official bare period keys', () => {
    const rows = mapFundDrawdownRows('009049', [{
      week: -1.2,
      month: -3.6,
      year: -12.5,
      now: -31.2,
      nowyear: -7.3,
    }])
    assert.ok(rows.some(r => r.period === 'w1' && r.value === -1.2))
    assert.ok(rows.some(r => r.period === 'w4' && r.value === -3.6))
    assert.ok(rows.some(r => r.period === 'w52' && r.value === -12.5))
    assert.ok(rows.some(r => r.period === 'year' && r.value === -7.3))
    assert.ok(rows.some(r => r.period === 'total' && r.value === -31.2))
    assert.ok(rows.length >= 5)
  })

  it('mapFundAllocationRow maps assets and industries', () => {
    const row = mapFundAllocationRow('009049', [
      { stock_ratio: 85.2, bond_ratio: 10, report_date_ms: 1719792000000 },
    ], [
      { industry_name: '电子', hold_ratio: 22.5 },
    ])
    assert.equal(row.assets.find(a => a.name === '股票')?.ratio, 85.2)
    assert.equal(row.industries[0]?.name, '电子')
    assert.equal(row.industries[0]?.ratio, 22.5)
    assert.equal(row.reportDate, '2024-07-01')
  })

  it('mapFundAllocationRow maps official ratio_pct fields', () => {
    const row = mapFundAllocationRow('009049', [
      {
        stock_ratio_pct: 82.3,
        bond_ratio_pct: 5.2,
        deposit_ratio_pct: 8.1,
        other_ratio_pct: 4.4,
        report_date_ms: 1719792000000,
      },
    ], [
      { industry_name: '银行', ratio_pct: 18.6, report_period: '2024Q2' },
    ])
    assert.equal(row.assets.find(a => a.name === '股票')?.ratio, 82.3)
    assert.equal(row.assets.find(a => a.name === '债券')?.ratio, 5.2)
    assert.equal(row.assets.find(a => a.name === '现金及存款')?.ratio, 8.1)
    assert.equal(row.industries[0]?.ratio, 18.6)
    assert.equal(row.reportDate, '2024-07-01')
  })

  it('mapFundHoldersRow maps official hold_rate_pct and mgmt_staff_hold_rate', () => {
    const row = mapFundHoldersRow('009049', [
      {
        holder_amount: 12000,
        ins_position: 40,
        psnl_rate: 60,
        mgmt_staff_hold_rate: 1.2,
        merge_scope: 'separate',
        report_date_ms: 1719792000000,
      },
    ], [
      { holder_name: '某银行', hold_share: 1e7, hold_rate_pct: 8.5 },
    ])
    assert.ok(row)
    assert.equal(row.mgmtStaffHoldRatio, 1.2)
    assert.equal(row.top[0]?.ratio, 8.5)
  })

  it('mapFundHoldersRow maps structure and top holders', () => {
    const row = mapFundHoldersRow('009049', [
      { holder_amount: 12000, ins_position: 40, psnl_rate: 60, merge_scope: 'separate', report_date_ms: 1719792000000 },
    ], [
      { holder_name: '某银行', hold_share: 1e7, hold_ratio: 8.5 },
    ])
    assert.ok(row)
    assert.equal(row.holderAmount, 12000)
    assert.equal(row.instHolderRatio, 40)
    assert.equal(row.top[0]?.name, '某银行')
    assert.equal(row.top[0]?.ratio, 8.5)
  })

  it('mapFundDividendRows maps official ex_dividend_date_ms / per_ten_cash / progress', () => {
    const rows = mapFundDividendRows('009049', [
      {
        ex_dividend_date_ms: 1719792000000,
        registration_date_ms: 1719705600000,
        per_ten_cash_before_tax: 0.15,
        progress: '已实施',
      },
    ], { dividend_count: 12, dividend_total: 1.8 })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].date, '2024-07-01')
    assert.equal(rows[0].recordDate, '2024-06-30')
    assert.equal(rows[0].amount, 0.15)
    assert.equal(rows[0].type, '已实施')
    assert.equal(rows[0].dividendCount, 12)
    assert.equal(rows[0].dividendTotal, 1.8)
  })

  it('mapFundDividendRows maps ex-date and amount', () => {
    const rows = mapFundDividendRows('009049', [
      { ex_date_ms: 1719792000000, record_date_ms: 1719705600000, unit_dividend: 0.12, bonus_type: '现金分红' },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].date, '2024-07-01')
    assert.equal(rows[0].amount, 0.12)
    assert.equal(rows[0].type, '现金分红')
  })

  it('mapFundRateInfo maps all fee rows', () => {
    const rates = mapFundRateInfo([
      { rate_type: '管理费', standard_rate: 1.5 },
      { rate_name: '托管费', rate: 0.25 },
    ])
    assert.equal(rates.length, 2)
    assert.equal(rates[0].label, '管理费')
    assert.equal(rates[0].rate, 1.5)
    assert.equal(rates[1].label, '托管费')
    assert.equal(rates[1].rate, 0.25)
  })

  it('mapFundRateInfo notes include charge_mode / condition / preferential', () => {
    const rates = mapFundRateInfo([
      {
        rate_type: '申购费',
        standard_rate: 1.5,
        charge_mode: '前端',
        condition: '金额<100万',
        preferential_rate: 0.15,
      },
    ])
    assert.equal(rates.length, 1)
    assert.match(String(rates[0].note ?? ''), /收费模式：前端/)
    assert.match(String(rates[0].note ?? ''), /条件：金额<100万/)
    assert.match(String(rates[0].note ?? ''), /优惠费率：0\.15%/)
  })

  it('mapFundManagerRow synthesizes detail + style + experience + performance', () => {
    const row = mapFundManagerRow('009049', 'mgr-001', {
      detail: { manager_name: '李四', education: '硕士', resume: '从业十年', work_years: 10 },
      style: { style_name: '成长', prefer_industry: '医药' },
      experience: [{ fund_name: '测试基金', start_date_ms: 1609459200000 }],
      performance: { return_year: 15.2 },
      profile: { manager_name: '李四' },
    })
    assert.ok(row)
    assert.equal(row.managerId, 'mgr-001')
    assert.equal(row.name, '李四')
    assert.equal(row.education, '硕士')
    assert.equal(row.workYears, 10)
    assert.equal(row.years, 10)
    assert.equal(row.style, '成长')
    assert.equal(typeof row.style, 'string')
    assert.equal(row.experienceList?.length, 1)
    assert.equal(row.representFunds?.[0], '测试基金')
    assert.equal(row.performance?.return_year, 15.2)
    assert.match(String(row.performanceSummary ?? ''), /近一年/)
  })

  it('formatManagerGender maps m/f and 男/女 to 男性/女性', () => {
    assert.equal(formatManagerGender('m'), '男性')
    assert.equal(formatManagerGender('F'), '女性')
    assert.equal(formatManagerGender('男'), '男性')
    assert.equal(formatManagerGender('女'), '女性')
    assert.equal(formatManagerGender('男性'), '男性')
    assert.equal(formatManagerGender('unknown'), undefined)
  })

  it('mapFundManagerRow maps official degree/sex/investment_idea/resume fields', () => {
    const row = mapFundManagerRow('009049', 'mgr-002', {
      detail: {
        manager_name: '示例经理',
        sex: '男',
        degree: '硕士',
        resume: '基金经理履历',
        annual_return_pct: 8.6,
        maximum_return_pct: 35.2,
      },
      style: {
        representative_fund_name: '沪深300ETF',
        investment_idea: '注重长期配置与风险控制',
        total_fund_scale: 12345678900,
        industry_preferences: { 银行: 20, 电子: 15 },
      },
      experience: [{
        awards: { name: '金牛奖' },
        heavy_assets: { fund_name: '某重仓基金' },
        investment_history: [{ fund_name: '历史管理基金A', period: '2018-2020' }],
      }],
      performance: [
        { date_ms: 1, manager_return_pct: 3.1 },
        { date_ms: 2, manager_return_pct: 8.2 },
      ],
    })
    assert.ok(row)
    assert.equal(row.gender, '男性')
    assert.equal(row.education, '硕士')
    assert.equal(row.resume, '基金经理履历')
    assert.equal(row.philosophy, '注重长期配置与风险控制')
    assert.equal(row.representFunds?.[0], '沪深300ETF')
    assert.ok(row.representFunds?.includes('历史管理基金A'))
    assert.equal(row.scale, 123.456789)
    assert.match(String(row.performanceSummary ?? ''), /年化收益 8\.6%/)
    assert.ok(row.experienceSections?.some(s => s.title === '获奖记录'))
    assert.match(String(row.experienceSections?.[0]?.items?.[0]?.primary ?? ''), /金牛奖/)
    assert.equal(typeof row.style, 'string')
    assert.notEqual(String(row.style), '[object Object]')
  })

  it('mapFundDiagnosisRow maps score and dimensions', () => {
    const row = mapFundDiagnosisRow('009049', {
      score: 82,
      grade: '优秀',
      summary: '综合表现靠前',
      dimensions: [
        { name: '收益', score: 90 },
        { label: '风险', value: 70 },
      ],
    })
    assert.ok(row)
    assert.equal(row.score, 82)
    assert.equal(row.grade, '优秀')
    assert.equal(row.dimensions?.length, 2)
    assert.equal(row.dimensions?.[0]?.name, '收益')
  })

  it('mapFundDiagnosisRow rejects empty nested objects and flattens nested dimensions', () => {
    const empty = mapFundDiagnosisRow('009049', {
      dimensions: {},
      peer_dimensions: {},
      resilience: {},
      peer_resilience: {},
    })
    assert.equal(empty, null)

    const nested = mapFundDiagnosisRow('009049', {
      dimensions: {
        收益能力: { score: 88, label: '优秀' },
        抗风险: { score: 72 },
      },
      peer_dimensions: {
        收益能力: { score: 70 },
      },
      resilience: { score: 65, label: '中等' },
    })
    assert.ok(nested)
    assert.equal(nested.dimensions?.length, 2)
    assert.equal(nested.dimensions?.find(d => d.name === '收益能力')?.peerAvg, 70)
    assert.equal(nested.resilience, '中等 65')
    assert.notEqual(String(nested.resilience), '[object Object]')
    assert.notEqual(String(nested.summary ?? ''), '[object Object]')
  })

  it('mapFundDiagnosisRow parses official year-based dimensions and resilience arrays', () => {
    const row = mapFundDiagnosisRow('009049', {
      dimensions: [
        {
          year: '1',
          performance_capability_score: '98',
          anti_risk_score: '43',
          integrate_score: '99',
        },
      ],
      peer_dimensions: [
        {
          year: '1',
          performance_capability_score: '50',
          anti_risk_score: '49',
        },
      ],
      resilience: [
        { time_type: 'oYear', max_down: '27.47', sharpe: '1.64' },
      ],
      peer_resilience: [
        { time_type: 'oYear', max_down: '10.48', sharpe: '0.13' },
      ],
    })
    assert.ok(row)
    assert.equal(row.dimensions?.find(d => d.name === '近 1 年 · 业绩能力')?.score, 98)
    assert.equal(row.dimensions?.find(d => d.name === '近 1 年 · 业绩能力')?.peerAvg, 50)
    assert.equal(row.resilienceItems?.length, 1)
    assert.equal(row.resilienceItems?.[0]?.maxDrawdown, -27.47)
    assert.equal(row.resilienceItems?.[0]?.peerMaxDrawdown, -10.48)
    assert.equal(row.resilience, undefined)
  })

  it('mapFundDrawdownRows drops all-zero official blob', () => {
    const rows = mapFundDrawdownRows('009049', [{
      week: 0,
      month: 0,
      year: 0,
      now: 0,
    }])
    assert.equal(rows.length, 0)
  })

  it('mapFundDrawdownFromResilience maps diagnosis resilience fallback', () => {
    const rows = mapFundDrawdownFromResilience('009049', {
      resilience: [
        { time_type: 'oYear', max_down: '18.2', sharpe: '1.1' },
        { time_type: 'hYear', max_down: '9.5', sharpe: '0.8' },
      ],
    })
    assert.ok(rows.some(r => r.period === 'w52' && r.value === -18.2))
    assert.ok(rows.some(r => r.period === 'w26' && r.value === -9.5))
  })

  it('mapFundAllocationRow keeps latest report period only', () => {
    const row = mapFundAllocationRow('009049', [
      { stock_ratio_pct: 80, report_period: '2024Q4' },
      { stock_ratio_pct: 90, report_period: '2025Q4' },
    ], [
      { industry_name: '电子', ratio_pct: 12, report_period: '2024Q4' },
      { industry_name: '通信', ratio_pct: 16, report_period: '2025Q4' },
    ])
    assert.equal(row.assets.find(a => a.name === '股票')?.ratio, 90)
    assert.equal(row.industries.length, 1)
    assert.equal(row.industries[0]?.name, '通信')
    assert.equal(row.industries[0]?.ratio, 16)
    assert.equal(row.reportDate, '2025Q4')
  })

  it('mapFundManagerRow maps m/f sex codes', () => {
    const row = mapFundManagerRow('009049', 'mgr-mf', {
      detail: { manager_name: '测试', sex: 'f' },
    })
    assert.equal(row?.gender, '女性')
  })

  it('mapFundProfileToFundProfileRow reads manager_info and trade_rule', () => {
    const row = mapFundProfileToFundProfileRow('009049', {
      fund_name: '测试基金',
      manager_info: [{ manager_id: 'mgr-from-info', manager_name: '王五' }],
      trade_rule: [{ title: '开放日说明', display_time_ms: 1719792000000 }],
      rate_info: [
        {
          rate_type: '申购费',
          standard_rate: 1.2,
          condition: '金额≥100万',
          preferential_rate: 0.12,
        },
      ],
    })
    assert.equal(row.managerId, 'mgr-from-info')
    assert.equal(row.manager, '王五')
    assert.ok(row.tradeRules?.some(r => r.includes('开放日说明')))
    assert.match(String(row.rateInfo?.[0]?.note ?? ''), /优惠费率/)
  })

  it('mapFundNewsRows prefers publish_time_ms', () => {
    const rows = mapFundNewsRows('009049', [
      { title: '基金季报披露', publish_time_ms: 1719792000000, url: 'https://example.com/a', source: '财联社' },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].date, '2024-07-01')
  })

  it('mapFundNewsRows maps article list', () => {
    const rows = mapFundNewsRows('009049', [
      { title: '基金季报披露', publish_date_ms: 1719792000000, url: 'https://example.com/a', source: '财联社' },
      { article_title: '', url: 'https://example.com/b' },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].title, '基金季报披露')
    assert.equal(rows[0].date, '2024-07-01')
    assert.equal(rows[0].sourceName, '财联社')
  })

  it('mapFundProfileToFundProfileRow maps manager_info tenure and company enrich', () => {
    const row = mapFundProfileToFundProfileRow('009049', {
      fund_name: '测试基金',
      manager_info: [{
        manager_id: 'mgr-tenure',
        manager_name: '赵六',
        start_date_ms: 1609459200000,
        office_days: 1800,
        tenure_return: 42.5,
      }],
      mgmt_id: 'co-1',
      mgmt_name: '示例基金',
    }, {
      company: {
        company_type: '公募',
        fund_count: 86,
        scale: 5e10,
        established_date_ms: 946684800000,
      },
    })
    assert.equal(row.managerStartDate, '2021-01-01')
    assert.equal(row.managerOfficeDays, 1800)
    assert.equal(row.managerTenureReturn, 42.5)
    assert.equal(row.companyType, '公募')
    assert.equal(row.companyFundCount, 86)
    assert.equal(row.companyScale, 500)
    assert.equal(row.companyEstablishDate, '2000-01-01')
  })

  it('mapFundFinancialsRow maps indicator rows only', () => {
    const row = mapFundFinancialsRow('009049', [
      { indicator_name: '净资产', value: 1.5e9, unit: '元', report_date_ms: 1719792000000 },
      { name: '净利润', indicator_value: 2.3e7 },
    ])
    assert.ok(row)
    assert.equal(row.reportDate, '2024-07-01')
    assert.equal(row.indicators.length, 2)
    assert.equal(row.indicators[0].label, '净资产')
    assert.equal(row.indicators[0].value, 1.5e9)
    assert.equal(row.indicators[1].label, '净利润')
    assert.equal(row.netProfit, 2.3e7)
  })

  it('mapFundFinancialsRow maps official wide-table Chinese labels', () => {
    const row = mapFundFinancialsRow('009049', [{
      end_date_ms: 1719792000000,
      distribution_profit: 1250000000.5,
      current_profit: 1180000000.2,
      share_nav: 4.753,
      nav_rate: 3.21,
      asset_nav: 9.8e9,
    }])
    assert.ok(row)
    assert.ok(row.indicators.some(i => i.label === '可分配利润' && i.value === 1250000000.5))
    assert.ok(row.indicators.some(i => i.label === '单位净值' && i.value === 4.753))
    assert.ok(row.indicators.some(i => i.label === '净值增长率' && i.value === 3.21))
    assert.ok(row.indicators.some(i => i.label === '基金资产净值'))
    assert.equal(row.netProfit, 1180000000.2)
  })
})

describe('fuyao client adapter', () => {
  it('FuyaoApiError keeps code + rawMessage for fund 3001 path', () => {
    const e = new FuyaoApiError(3001, 'Fund not found: 000001.OF', 'req-1')
    assert.equal(e.code, 3001)
    assert.equal(e.rawMessage, 'Fund not found: 000001.OF')
    assert.equal(e.requestId, 'req-1')
    assert.ok(e instanceof FuyaoApiError)
    assert.match(e.message, /not found/i)
  })

  it('FuyaoClient exposes legacy public methods and fromConfig', () => {
    const client = new FuyaoClient('test-key-for-shape')
    for (const name of [
      'tickersSearch',
      'pricesSnapshot',
      'pricesHistorical',
      'fundProfileDetail',
      'fundPerformanceNav',
      'fundMarketHistorical',
      'fundOfferingsList',
      'fundPerformanceIndicatorsHistorical',
      'fundFinancialsIndicators',
      'tickersListAll',
    ]) {
      assert.equal(typeof client[name], 'function', name)
    }
    assert.equal(typeof FuyaoClient.fromConfig, 'function')
  })

  it('fundPortfolioStockHistory rejects legacy ms-only args', () => {
    const client = new FuyaoClient('test-key-for-shape')
    assert.throws(
      () => client.fundPortfolioStockHistory('otc', '009049.OF', 1719792000000),
      (err) => err instanceof TypeError && /reportType/.test(err.message),
    )
  })
})
