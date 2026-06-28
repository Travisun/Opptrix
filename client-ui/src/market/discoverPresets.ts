export interface DiscoverScreenCondition {
  factor: string
  op: '>' | '<' | '>=' | '<=' | '='
  value: number
}

export interface DiscoverPreset {
  id: string
  name: string
  description: string
  scorecard?: string
  topN?: number
  conditions: DiscoverScreenCondition[]
}

/** Preset strategy pools — aligned with docs/RIGHT-PANEL-RESEARCH-PLAN.md P2 */
export const DISCOVER_PRESETS: DiscoverPreset[] = [
  {
    id: 'value',
    name: '价值回归',
    description: 'PE 历史低分位 + ROE 稳定',
    conditions: [
      { factor: 'pe_percentile', op: '<=', value: 35 },
      { factor: 'roe', op: '>=', value: 12 },
    ],
  },
  {
    id: 'garp',
    name: 'GARP',
    description: 'PEG 合理 + 净利润 3 年 CAGR',
    conditions: [
      { factor: 'peg', op: '<=', value: 1.5 },
      { factor: 'profit_cagr_3y', op: '>=', value: 10 },
    ],
  },
  {
    id: 'quality',
    name: '质量成长',
    description: 'ROE 改善 + 毛利率 + 低负债',
    conditions: [
      { factor: 'roe_trend', op: '>', value: 0.5 },
      { factor: 'gross_margin', op: '>=', value: 25 },
      { factor: 'debt_ratio', op: '<=', value: 55 },
    ],
  },
  {
    id: 'momentum',
    name: '动量突破',
    description: '12-1 月动量 + 放量',
    conditions: [
      { factor: 'momentum_12m_1m', op: '>', value: 5 },
      { factor: 'volume_ratio', op: '>=', value: 1.4 },
    ],
  },
  {
    id: 'flow',
    name: '资金共振',
    description: '量比放大 + 短期动量（代理资金活跃）',
    conditions: [
      { factor: 'volume_ratio', op: '>=', value: 1.4 },
      { factor: 'momentum_1m', op: '>', value: 3 },
    ],
  },
]

export function getDiscoverPreset(id: string): DiscoverPreset | undefined {
  return DISCOVER_PRESETS.find(p => p.id === id)
}
