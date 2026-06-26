import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import type { FactorResult } from '@inno-a-stock/shared'
import { registerFactor } from '../core/registry.js'
import {
  annualVol, attrSeries, betaVsIndex, cagr, finSeries, m, maxDrawdown,
  momReturn, r, rsi, safeDelta, safePct,
} from './helpers.js'

type Fn = (de: AshareEngine, code: string) => Promise<FactorResult | null>

function reg(meta: ReturnType<typeof m>, fn: Fn) {
  registerFactor(meta, fn)
}

export function registerAllFactors() {
  // ── Valuation ──
  reg(m('pe_percentile', 'valuation', 'PE历史百分位', false), async (de, code) => {
    const [k, fin] = await Promise.all([de.kline(code, 1200), de.financials(code)])
    const eps = fin.data?.[0]?.eps
    if (!k.success || !k.data?.length || !eps || eps <= 0) return null
    const closes = k.data.map(x => x.close)
    const curPe = closes[closes.length - 1] / eps
    const histPe = closes.map(c => c / eps)
    const pct = histPe.filter(p => p < curPe).length / histPe.length * 100
    return { name: 'pe_percentile', value: r(pct, 1), meta: m('pe_percentile', 'valuation', 'PE历史百分位', false) }
  })

  reg(m('pb_percentile', 'valuation', 'PB历史百分位', false), async (de, code) => {
    const [k, fin] = await Promise.all([de.kline(code, 1200), de.financials(code)])
    const latest = fin.data?.[0]
    if (!k.success || !k.data?.length || !latest?.eps || !latest.roe || latest.roe <= 0) return null
    const bps = latest.eps / latest.roe
    if (bps <= 0) return null
    const closes = k.data.map(x => x.close)
    const curPb = closes[closes.length - 1] / bps
    const histPb = closes.map(c => c / bps)
    const pct = histPb.filter(p => p < curPb).length / histPb.length * 100
    return { name: 'pb_percentile', value: r(pct, 1), meta: m('pb_percentile', 'valuation', 'PB历史百分位', false) }
  })

  reg(m('dividend_yield', 'valuation', '股息率'), async (de, code) => {
    const rt = await de.realtime(code)
    const pe = rt.data?.[0]?.pe
    if (pe == null || pe <= 0) return null
    return { name: 'dividend_yield', value: r(100 / pe, 2), meta: m('dividend_yield', 'valuation', '股息率') }
  })

  reg(m('peg', 'valuation', 'PEG', false), async (de, code) => {
    const [fin, rt] = await Promise.all([de.financials(code), de.realtime(code)])
    const price = rt.data?.[0]?.price
    const eps = fin.data?.[0]?.eps
    if (!price || !eps || eps <= 0 || !fin.data || fin.data.length < 3) return null
    const profits = fin.data.map(f => f.netProfit).filter((v): v is number => v != null && v > 0).slice(0, 3)
    if (profits.length < 2) return null
    const cg = cagr(profits)
    if (cg == null || cg <= 0) return null
    const pe = price / eps
    return { name: 'peg', value: r(pe / cg, 2), meta: m('peg', 'valuation', 'PEG', false) }
  })

  // ── Growth / Financial ──
  reg(m('revenue_cagr_3y', 'growth', '营收3年CAGR'), async (de, code) => {
    const fins = await finSeries(de, code)
    const v = cagr(attrSeries(fins, 'revenue'))
    return v == null ? null : { name: 'revenue_cagr_3y', value: r(v), meta: m('revenue_cagr_3y', 'growth', '营收3年CAGR') }
  })

  reg(m('profit_cagr_3y', 'growth', '净利润3年CAGR'), async (de, code) => {
    const fins = await finSeries(de, code)
    const v = cagr(attrSeries(fins, 'netProfit'))
    return v == null ? null : { name: 'profit_cagr_3y', value: r(v), meta: m('profit_cagr_3y', 'growth', '净利润3年CAGR') }
  })

  reg(m('roe_trend', 'quality', 'ROE趋势'), async (de, code) => {
    const roes = attrSeries(await finSeries(de, code), 'roe').filter((v): v is number => v != null)
    if (roes.length < 2) return null
    return { name: 'roe_trend', value: r(roes[0] - roes[roes.length - 1]), meta: m('roe_trend', 'quality', 'ROE趋势') }
  })

  reg(m('gross_margin_trend', 'quality', '毛利率趋势'), async (de, code) => {
    const gms = attrSeries(await finSeries(de, code), 'grossMargin').filter((v): v is number => v != null)
    if (gms.length < 2) return null
    return { name: 'gross_margin_trend', value: r(gms[0] - gms[gms.length - 1]), meta: m('gross_margin_trend', 'quality', '毛利率趋势') }
  })

  reg(m('debt_ratio', 'risk', '资产负债率', false), async (de, code) => {
    const v = (await finSeries(de, code))[0]?.debtRatio
    return v == null ? null : { name: 'debt_ratio', value: r(v), meta: m('debt_ratio', 'risk', '资产负债率', false) }
  })

  reg(m('fcf_yield', 'quality', '自由现金流收益率'), async (de, code) => {
    const [fin, rt] = await Promise.all([de.financialsQuarterly(code), de.realtime(code)])
    const fcf = fin.data?.[0]?.operatingCashFlow
    const mcap = rt.data?.[0]?.marketCap
    if (fcf == null || !mcap || mcap <= 0) return null
    return { name: 'fcf_yield', value: r((fcf / mcap) * 100, 3), meta: m('fcf_yield', 'quality', '自由现金流收益率') }
  })

  // ── Quality ──
  reg(m('roe', 'quality', '净资产收益率'), async (de, code) => {
    const v = (await finSeries(de, code))[0]?.roe
    return v == null ? null : { name: 'roe', value: r(v), meta: m('roe', 'quality', '净资产收益率') }
  })

  reg(m('gross_margin', 'quality', '毛利率'), async (de, code) => {
    const v = (await finSeries(de, code))[0]?.grossMargin
    return v == null ? null : { name: 'gross_margin', value: r(v), meta: m('gross_margin', 'quality', '毛利率') }
  })

  reg(m('operating_margin', 'quality', '营业利润率'), async (de, code) => {
    const f = (await finSeries(de, code))[0]
    if (!f?.revenue || !f.netProfit || f.revenue === 0) return null
    return { name: 'operating_margin', value: r((f.netProfit / f.revenue) * 100), meta: m('operating_margin', 'quality', '营业利润率') }
  })

  reg(m('net_profit_margin', 'quality', '净利润率'), async (de, code) => {
    const f = (await finSeries(de, code))[0]
    if (!f?.revenue || !f.netProfit || f.revenue === 0) return null
    return { name: 'net_profit_margin', value: r((f.netProfit / f.revenue) * 100), meta: m('net_profit_margin', 'quality', '净利润率') }
  })

  reg(m('asset_turnover', 'quality', '资产周转率'), async (de, code) => {
    const f = (await finSeries(de, code))[0]
    if (!f?.revenue || !f.totalAssets || f.totalAssets === 0) return null
    return { name: 'asset_turnover', value: r(f.revenue / f.totalAssets, 3), meta: m('asset_turnover', 'quality', '资产周转率') }
  })

  // ── Momentum ──
  for (const [name, days, desc] of [
    ['momentum_1m', 20, '1月动量'],
    ['momentum_3m', 60, '3月动量'],
    ['momentum_6m', 120, '6月动量'],
  ] as const) {
    reg(m(name, 'momentum', desc), async (de, code) => {
      const k = await de.kline(code, days + 30)
      if (!k.success || !k.data) return null
      const v = momReturn(k.data.map(x => x.close), days)
      return v == null ? null : { name, value: r(v), meta: m(name, 'momentum', desc) }
    })
  }

  reg(m('momentum_12m_1m', 'momentum', '12-1月动量'), async (de, code) => {
    const k = await de.kline(code, 280)
    if (!k.success || !k.data || k.data.length < 240) return null
    const closes = k.data.map(x => x.close)
    const m12 = momReturn(closes, 240)
    const m1 = momReturn(closes, 20)
    if (m12 == null || m1 == null) return null
    return { name: 'momentum_12m_1m', value: r(m12 - m1), meta: m('momentum_12m_1m', 'momentum', '12-1月动量') }
  })

  reg(m('short_term_reversal', 'momentum', '短期反转'), async (de, code) => {
    const k = await de.kline(code, 30)
    if (!k.success || !k.data) return null
    const v = momReturn(k.data.map(x => x.close), 5)
    return v == null ? null : { name: 'short_term_reversal', value: r(-v), meta: m('short_term_reversal', 'momentum', '短期反转') }
  })

  // ── Technical / Risk ──
  reg(m('beta_1y', 'risk', '1年Beta', false), async (de, code) => {
    const b = await betaVsIndex(de, code)
    return b == null ? null : { name: 'beta_1y', value: r(b, 3), meta: m('beta_1y', 'risk', '1年Beta', false) }
  })

  reg(m('volatility_1y', 'risk', '1年波动率', false), async (de, code) => {
    const k = await de.kline(code, 260)
    if (!k.success || !k.data) return null
    const v = annualVol(k.data.map(x => x.close))
    return v == null ? null : { name: 'volatility_1y', value: r(v), meta: m('volatility_1y', 'risk', '1年波动率', false) }
  })

  reg(m('max_drawdown_1y', 'risk', '1年最大回撤', false), async (de, code) => {
    const k = await de.kline(code, 260)
    if (!k.success || !k.data) return null
    return { name: 'max_drawdown_1y', value: r(maxDrawdown(k.data.map(x => x.close))), meta: m('max_drawdown_1y', 'risk', '1年最大回撤', false) }
  })

  reg(m('ma_position', 'technical', '相对MA60位置', false), async (de, code) => {
    const k = await de.kline(code, 120)
    if (!k.success || !k.data || k.data.length < 60) return null
    const closes = k.data.map(x => x.close)
    const ma60 = closes.slice(-60).reduce((a, b) => a + b, 0) / 60
    const cur = closes[closes.length - 1]
    return { name: 'ma_position', value: r(((cur - ma60) / ma60) * 100), meta: m('ma_position', 'technical', '相对MA60位置', false) }
  })

  reg(m('rsi_score', 'technical', 'RSI(14)'), async (de, code) => {
    const k = await de.kline(code, 60)
    if (!k.success || !k.data) return null
    const v = rsi(k.data.map(x => x.close))
    return v == null ? null : { name: 'rsi_score', value: r(v, 1), meta: m('rsi_score', 'technical', 'RSI(14)') }
  })

  reg(m('volume_ratio', 'technical', '量比'), async (de, code) => {
    const k = await de.kline(code, 80)
    if (!k.success || !k.data || k.data.length < 40) return null
    const vols = k.data.map(x => x.volume)
    const short = vols.slice(-5).reduce((a, b) => a + b, 0) / 5
    const long = vols.slice(-40, -5).reduce((a, b) => a + b, 0) / 35
    if (!long) return null
    return { name: 'volume_ratio', value: r(short / long, 2), meta: m('volume_ratio', 'technical', '量比') }
  })

  // ── Delta (quarterly) ──
  const deltaReg = (
    name: string, desc: string, cat: 'growth' | 'quality' = 'growth',
    fn: (s: Awaited<ReturnType<typeof finSeries>>) => number | null,
  ) => {
    reg(m(name, cat, desc), async (de, code) => {
      const s = await finSeries(de, code, true)
      const v = fn(s)
      return v == null ? null : { name, value: r(v), meta: m(name, cat, desc) }
    })
  }

  deltaReg('roe_delta_1q', 'ROE环比变化', 'growth', s => safeDelta(s[0]?.roe, s[1]?.roe))
  deltaReg('roe_delta_4q', 'ROE同比变化', 'growth', s => safeDelta(s[0]?.roe, s[4]?.roe ?? s[s.length - 1]?.roe))
  deltaReg('revenue_delta_1q', '营收环比变化率', 'growth', s => safePct(s[0]?.revenue, s[1]?.revenue))
  deltaReg('revenue_delta_4q', '营收同比变化率', 'growth', s => safePct(s[0]?.revenue, s[4]?.revenue ?? s[s.length - 1]?.revenue))
  deltaReg('profit_delta_1q', '净利润环比变化率', 'growth', s => safePct(s[0]?.netProfit, s[1]?.netProfit))
  deltaReg('profit_delta_4q', '净利润同比变化率', 'growth', s => safePct(s[0]?.netProfit, s[4]?.netProfit ?? s[s.length - 1]?.netProfit))
  deltaReg('gross_margin_delta_1q', '毛利率环比变化', 'quality', s => safeDelta(s[0]?.grossMargin, s[1]?.grossMargin))
  deltaReg('gross_margin_delta_4q', '毛利率同比变化', 'quality', s => safeDelta(s[0]?.grossMargin, s[4]?.grossMargin ?? s[s.length - 1]?.grossMargin))
  deltaReg('debt_ratio_delta_1q', '负债率环比变化', 'quality', s => safeDelta(s[0]?.debtRatio, s[1]?.debtRatio))

  reg(m('fcf_delta_1q', 'cashflow', 'FCF环比变化率'), async (de, code) => {
    const s = await finSeries(de, code, true)
    const v = safePct(s[0]?.operatingCashFlow, s[1]?.operatingCashFlow)
    return v == null ? null : { name: 'fcf_delta_1q', value: r(v), meta: m('fcf_delta_1q', 'cashflow', 'FCF环比变化率') }
  })

  reg(m('improvement_score', 'composite', '边际改善综合分'), async (de, code) => {
    const s = await finSeries(de, code, true)
    const scores: number[] = []
    const rd = safePct(s[0]?.revenue, s[1]?.revenue)
    const pd = safePct(s[0]?.netProfit, s[1]?.netProfit)
    const roed = safeDelta(s[0]?.roe, s[1]?.roe)
    if (rd != null) scores.push(rd > 0 ? 1 : 0)
    if (pd != null) scores.push(pd > 0 ? 1 : 0)
    if (roed != null) scores.push(roed > 0 ? 1 : 0)
    if (!scores.length) return null
    const v = (scores.reduce((a, b) => a + b, 0) / scores.length) * 10
    return { name: 'improvement_score', value: r(v), meta: m('improvement_score', 'composite', '边际改善综合分') }
  })

  // ── Absolute valuation (simplified DCF/DDM/RI) ──
  reg(m('dcf_margin', 'valuation', 'DCF估值偏离度'), async (de, code) => {
    const [fin, rt] = await Promise.all([de.financialsQuarterly(code), de.realtime(code)])
    const fcf = fin.data?.[0]?.operatingCashFlow
    const price = rt.data?.[0]?.price
    if (fcf == null || !price || price <= 0) return null
    const intrinsic = fcf * 8 / 1e8
    const margin = ((intrinsic - price) / price) * 100
    return { name: 'dcf_margin', value: r(margin), meta: m('dcf_margin', 'valuation', 'DCF估值偏离度') }
  })

  reg(m('residual_income_margin', 'valuation', '剩余收益估值偏离'), async (de, code) => {
    const [fin, rt] = await Promise.all([de.financials(code), de.realtime(code)])
    const f = fin.data?.[0]
    const price = rt.data?.[0]?.price
    if (!f?.netProfit || !f.totalAssets || !price) return null
    const ri = f.netProfit - 0.1 * f.totalAssets
    const intrinsic = ri * 10
    return { name: 'residual_income_margin', value: r(((intrinsic - price) / price) * 100), meta: m('residual_income_margin', 'valuation', '剩余收益估值偏离') }
  })

  reg(m('relative_value', 'valuation', '相对估值偏离'), async (de, code) => {
    const rt = await de.realtime(code)
    const pe = rt.data?.[0]?.pe
    if (pe == null || pe <= 0) return null
    const industryPe = 20
    return { name: 'relative_value', value: r(((industryPe - pe) / industryPe) * 100), meta: m('relative_value', 'valuation', '相对估值偏离') }
  })
}

registerAllFactors()
