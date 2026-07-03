/** Factor display names — aligned with packages/stock-eval/src/factors/register.ts */
export const FACTOR_LABELS: Record<string, string> = {
  pe: '市盈率',
  pb: '市净率',
  pe_percentile: 'PE历史百分位',
  pb_percentile: 'PB历史百分位',
  dividend_yield: '股息率',
  peg: 'PEG',
  revenue_cagr_3y: '营收3年CAGR',
  profit_cagr_3y: '净利润3年CAGR',
  roe_trend: 'ROE趋势',
  gross_margin_trend: '毛利率趋势',
  debt_ratio: '资产负债率',
  fcf_yield: '自由现金流收益率',
  roe: '净资产收益率',
  gross_margin: '毛利率',
  operating_margin: '营业利润率',
  net_profit_margin: '净利润率',
  asset_turnover: '资产周转率',
  momentum_1m: '1月动量',
  momentum_3m: '3月动量',
  momentum_6m: '6月动量',
  momentum_12m_1m: '12-1月动量',
  short_term_reversal: '短期反转',
  beta_1y: '1年Beta',
  volatility_1y: '1年波动率',
  max_drawdown_1y: '1年最大回撤',
  ma_position: '相对MA60位置',
  rsi_score: 'RSI(14)',
  volume_ratio: '量比',
  roe_delta_1q: 'ROE环比变化',
  roe_delta_4q: 'ROE同比变化',
  revenue_delta_1q: '营收环比变化',
  revenue_delta_4q: '营收同比变化',
  profit_delta_1q: '净利润环比变化',
  profit_delta_4q: '净利润同比变化',
  gross_margin_delta_1q: '毛利率环比变化',
  gross_margin_delta_4q: '毛利率同比变化',
  debt_ratio_delta_1q: '负债率环比变化',
  fcf_delta_1q: 'FCF环比变化',
  improvement_score: '边际改善综合分',
  dcf_margin: 'DCF估值偏离',
  residual_income_margin: '剩余收益估值偏离',
  relative_value: '相对估值偏离',
  premium_rate: '折溢价率',
  scale_yi: '规模（亿元）',
  nav: '单位净值',
  etf_score: '决策雷达分',
}

export function factorLabel(key: string): string | null {
  return FACTOR_LABELS[key] ?? null
}

function pct(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`
}

/** Positive thesis bullet for a factor reading; null if not meaningful. */
export function positiveFactorBullet(key: string, value: number): string | null {
  if (!factorLabel(key)) return null

  switch (key) {
    case 'pe':
      return value > 0 && value <= 25 ? `PE ${value.toFixed(1)}，估值偏低` : null
    case 'pe_percentile':
      return value <= 35 ? `估值偏低（PE ${Math.round(value)}% 历史分位）` : null
    case 'pb_percentile':
      return value <= 35 ? `PB ${Math.round(value)}% 历史分位，相对便宜` : null
    case 'peg':
      return value > 0 && value <= 1.5 ? `PEG ${value.toFixed(2)}，估值与成长匹配` : null
    case 'dividend_yield':
      return value >= 2 ? `股息率 ${pct(value)}` : null
    case 'revenue_cagr_3y':
      return value >= 10 ? `营收3年CAGR ${pct(value)}` : null
    case 'profit_cagr_3y':
      return value >= 10 ? `净利润3年CAGR ${pct(value)}` : null
    case 'roe':
      return value >= 12 ? `ROE ${pct(value)}` : null
    case 'roe_trend':
      return value > 0.5 ? `ROE 趋势改善 +${value.toFixed(1)}pct` : null
    case 'gross_margin':
      return value >= 25 ? `毛利率 ${pct(value)}` : null
    case 'gross_margin_trend':
      return value > 0.5 ? `毛利率趋势改善 +${value.toFixed(1)}pct` : null
    case 'operating_margin':
      return value >= 12 ? `营业利润率 ${pct(value)}` : null
    case 'net_profit_margin':
      return value >= 8 ? `净利润率 ${pct(value)}` : null
    case 'fcf_yield':
      return value >= 2 ? `自由现金流收益率 ${pct(value, 2)}` : null
    case 'asset_turnover':
      return value >= 0.6 ? `资产周转率 ${value.toFixed(2)}` : null
    case 'momentum_1m':
      return value > 3 ? `1月动量 +${pct(value)}` : null
    case 'momentum_3m':
    case 'momentum_6m':
      return value > 5 ? `${FACTOR_LABELS[key]} +${pct(value)}` : null
    case 'momentum_12m_1m':
      return value > 5 ? `12-1月动量 +${pct(value)}` : null
    case 'short_term_reversal':
      return value > 2 ? '短期超卖后存在反转动能' : null
    case 'ma_position':
      return value > 2 ? `价格高于 MA60 ${pct(value)}` : null
    case 'volume_ratio':
      return value >= 1.4 ? `量比 ${value.toFixed(2)}，成交放大` : null
    case 'improvement_score':
      return value >= 7 ? `边际改善综合分 ${value.toFixed(1)}` : null
    case 'dcf_margin':
    case 'residual_income_margin':
    case 'relative_value':
      return value >= 10 ? `${FACTOR_LABELS[key]} +${pct(value)}，模型估值偏低估` : null
    case 'revenue_delta_1q':
    case 'revenue_delta_4q':
      return value >= 5 ? `${FACTOR_LABELS[key]} +${pct(value)}` : null
    case 'profit_delta_1q':
    case 'profit_delta_4q':
      return value >= 10 ? `${FACTOR_LABELS[key]} +${pct(value)}` : null
    case 'roe_delta_1q':
    case 'roe_delta_4q':
      return value >= 0.5 ? `${FACTOR_LABELS[key]} +${value.toFixed(1)}pct` : null
    case 'gross_margin_delta_1q':
    case 'gross_margin_delta_4q':
      return value >= 0.5 ? `${FACTOR_LABELS[key]} +${value.toFixed(1)}pct` : null
    case 'fcf_delta_1q':
      return value >= 10 ? `FCF 环比 +${pct(value)}` : null
    default:
      return null
  }
}

/** Risk bullet for a factor reading; null if not meaningful. */
export function riskFactorBullet(key: string, value: number): string | null {
  if (!factorLabel(key)) return null

  switch (key) {
    case 'debt_ratio':
      return value >= 55 ? `资产负债率 ${pct(value)}` : null
    case 'debt_ratio_delta_1q':
      return value >= 2 ? `负债率环比上升 +${value.toFixed(1)}pct` : null
    case 'pe_percentile':
      return value >= 75 ? `估值偏高（PE ${Math.round(value)}% 历史分位）` : null
    case 'pb_percentile':
      return value >= 75 ? `PB ${Math.round(value)}% 历史分位，相对偏贵` : null
    case 'peg':
      return value > 2.5 ? `PEG ${value.toFixed(2)}，估值偏贵` : null
    case 'momentum_3m':
      return value < -5 ? '3月动量偏弱' : null
    case 'momentum_6m':
      return value < -8 ? '6月动量偏弱' : null
    case 'momentum_1m':
      return value < -5 ? '1月动量走弱' : null
    case 'beta_1y':
      return value >= 1.25 ? `1年 Beta ${value.toFixed(2)}，波动高于大盘` : null
    case 'volatility_1y':
      return value >= 35 ? `1年波动率 ${pct(value)}` : null
    case 'max_drawdown_1y':
      return value >= 30 ? `1年最大回撤 ${pct(value)}` : null
    case 'profit_cagr_3y':
      return value < 0 ? `净利润3年CAGR ${pct(value)}` : null
    case 'revenue_cagr_3y':
      return value < 0 ? `营收3年CAGR ${pct(value)}` : null
    case 'roe':
      return value < 5 ? `ROE 偏低 ${pct(value)}` : null
    case 'profit_delta_1q':
    case 'profit_delta_4q':
      return value <= -10 ? `${FACTOR_LABELS[key]} ${pct(value)}` : null
    case 'revenue_delta_1q':
    case 'revenue_delta_4q':
      return value <= -5 ? `${FACTOR_LABELS[key]} ${pct(value)}` : null
    case 'rsi_score':
      return value >= 75 ? `RSI ${value.toFixed(0)}，短期偏热` : null
    default:
      return null
  }
}
