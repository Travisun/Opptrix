import type { ScorecardFactor } from './scorecard.js'

export interface ScorecardTemplate {
  description: string
  factors: ScorecardFactor[]
}

/** Scorecard templates for factor weighting */
export const TEMPLATES: Record<string, ScorecardTemplate> = {
  '价值评估': {
    description: '基于历史估值百分位和收益率的低估评估',
    factors: [
      { name: 'pe_percentile', weight: 0.25 },
      { name: 'pb_percentile', weight: 0.20 },
      { name: 'dividend_yield', weight: 0.20 },
      { name: 'fcf_yield', weight: 0.20 },
      { name: 'peg', weight: 0.15 },
    ],
  },
  '成长评估': {
    description: '基于营收/利润增速、ROE改善和边际变化的成长性评估',
    factors: [
      { name: 'revenue_cagr_3y', weight: 0.15 },
      { name: 'profit_cagr_3y', weight: 0.15 },
      { name: 'roe_trend', weight: 0.10 },
      { name: 'revenue_delta_4q', weight: 0.15 },
      { name: 'profit_delta_4q', weight: 0.15 },
      { name: 'gross_margin_delta_4q', weight: 0.10 },
      { name: 'improvement_score', weight: 0.10 },
      { name: 'peg', weight: 0.10 },
    ],
  },
  '质量评估': {
    description: '基于盈利能力、运营效率、财务健康、现金流质量的综合评估',
    factors: [
      { name: 'roe', weight: 0.20 },
      { name: 'gross_margin', weight: 0.15 },
      { name: 'operating_margin', weight: 0.12 },
      { name: 'net_profit_margin', weight: 0.10 },
      { name: 'asset_turnover', weight: 0.08 },
      { name: 'debt_ratio', weight: 0.10 },
      { name: 'fcf_yield', weight: 0.10 },
      { name: 'roe_delta_4q', weight: 0.05 },
      { name: 'fcf_delta_1q', weight: 0.05 },
      { name: 'debt_ratio_delta_1q', weight: 0.05 },
    ],
  },
  '技术评估': {
    description: '基于技术指标位置和量价关系的技术面评估',
    factors: [
      { name: 'ma_position', weight: 0.25 },
      { name: 'rsi_score', weight: 0.25 },
      { name: 'volume_ratio', weight: 0.25 },
      { name: 'volatility_1y', weight: 0.25 },
    ],
  },
  '动量评估': {
    description: '基于多周期价格动量的趋势评估',
    factors: [
      { name: 'momentum_1m', weight: 0.20 },
      { name: 'momentum_3m', weight: 0.25 },
      { name: 'momentum_6m', weight: 0.25 },
      { name: 'momentum_12m_1m', weight: 0.30 },
    ],
  },
  '综合评估': {
    description: '综合价值/成长/质量/技术/动量和边际变化的全面评估',
    factors: [
      { name: 'pe_percentile', weight: 0.06 },
      { name: 'pb_percentile', weight: 0.04 },
      { name: 'dividend_yield', weight: 0.05 },
      { name: 'revenue_cagr_3y', weight: 0.07 },
      { name: 'profit_cagr_3y', weight: 0.07 },
      { name: 'profit_delta_4q', weight: 0.06 },
      { name: 'revenue_delta_4q', weight: 0.05 },
      { name: 'roe', weight: 0.08 },
      { name: 'gross_margin', weight: 0.06 },
      { name: 'operating_margin', weight: 0.04 },
      { name: 'debt_ratio', weight: 0.04 },
      { name: 'fcf_yield', weight: 0.03 },
      { name: 'improvement_score', weight: 0.06 },
      { name: 'roe_delta_4q', weight: 0.03 },
      { name: 'gross_margin_delta_4q', weight: 0.03 },
      { name: 'ma_position', weight: 0.04 },
      { name: 'rsi_score', weight: 0.04 },
      { name: 'volume_ratio', weight: 0.05 },
      { name: 'momentum_3m', weight: 0.05 },
      { name: 'momentum_6m', weight: 0.05 },
    ],
  },
  '低风险评估': {
    description: '基于负债率、波动率、回撤、Beta的风险评估',
    factors: [
      { name: 'debt_ratio', weight: 0.20 },
      { name: 'debt_ratio_delta_1q', weight: 0.10 },
      { name: 'volatility_1y', weight: 0.20 },
      { name: 'max_drawdown_1y', weight: 0.20 },
      { name: 'beta_1y', weight: 0.20 },
      { name: 'fcf_yield', weight: 0.10 },
    ],
  },
  '困境反转': {
    description: '识别短期超卖、估值低位、边际改善的反转标的',
    factors: [
      { name: 'short_term_reversal', weight: 0.25 },
      { name: 'rsi_score', weight: 0.15 },
      { name: 'pe_percentile', weight: 0.15 },
      { name: 'ma_position', weight: 0.15 },
      { name: 'improvement_score', weight: 0.15 },
      { name: 'profit_delta_1q', weight: 0.15 },
    ],
  },
  'G=B+M': {
    description: 'AlphaGBM 框架：基本面质量与 market 动量各半，好生意加好动量',
    factors: [
      { name: 'roe', weight: 0.10 },
      { name: 'gross_margin', weight: 0.07 },
      { name: 'profit_cagr_3y', weight: 0.08 },
      { name: 'revenue_cagr_3y', weight: 0.06 },
      { name: 'debt_ratio', weight: 0.05 },
      { name: 'pe_percentile', weight: 0.06 },
      { name: 'peg', weight: 0.04 },
      { name: 'roe_trend', weight: 0.04 },
      { name: 'momentum_3m', weight: 0.10 },
      { name: 'momentum_6m', weight: 0.10 },
      { name: 'momentum_1m', weight: 0.06 },
      { name: 'ma_position', weight: 0.08 },
      { name: 'rsi_score', weight: 0.07 },
      { name: 'volume_ratio', weight: 0.06 },
      { name: 'improvement_score', weight: 0.03 },
    ],
  },
  '巴菲特四透镜': {
    description: 'Buffett 四透镜：护城河盈利、资本回报与估值纪律（A 股阈值适配）',
    factors: [
      { name: 'roe', weight: 0.22 },
      { name: 'gross_margin', weight: 0.18 },
      { name: 'dividend_yield', weight: 0.12 },
      { name: 'pe_percentile', weight: 0.20 },
      { name: 'pb_percentile', weight: 0.10 },
      { name: 'peg', weight: 0.10 },
      { name: 'profit_cagr_3y', weight: 0.08 },
    ],
  },
}

export const TEMPLATE_CATEGORIES: Record<string, string[]> = {
  估值: ['价值评估'],
  成长: ['成长评估'],
  质量: ['质量评估', '巴菲特四透镜'],
  技术: ['技术评估'],
  动量: ['动量评估'],
  风险: ['低风险评估'],
  反转: ['困境反转'],
  综合: ['综合评估', 'G=B+M'],
}

export function listTemplateNames() { return Object.keys(TEMPLATES) }
