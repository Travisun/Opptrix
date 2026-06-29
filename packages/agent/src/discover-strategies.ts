import type { DiscoverParsedPlan, DiscoverScreenCondition } from './discover.js'

export type DiscoverStrategyCategory = 'value' | 'growth' | 'quality' | 'momentum' | 'balanced'

export interface DiscoverStrategy {
  id: string
  name: string
  category: DiscoverStrategyCategory
  /** 一句话说明 */
  tagline: string
  /** 方法论出处与学术/投行参考 */
  methodology: string
  /** 执行说明（展示给用户） */
  description: string
  scorecard: string
  prescreen_top_n: number
  final_top_n: number
  conditions: DiscoverScreenCondition[]
  /** Agent 挖掘阶段的侧重点（预编译，非用户输入） */
  refinement_notes: string
}

const C = (factor: string, op: DiscoverScreenCondition['op'], value: number): DiscoverScreenCondition =>
  ({ factor, op, value })

/** 预编译选股策略 — 综合经典价值投资、GARP、学术因子与投行框架 */
export const DISCOVER_STRATEGIES: DiscoverStrategy[] = [
  {
    id: 'graham_margin',
    name: '格雷厄姆安全边际',
    category: 'value',
    tagline: '深度价值 · 低估值 + 财务稳健',
    methodology: '参考 Benjamin Graham《证券分析》安全边际与净流动价值思想；低 PE/PB、可控负债。',
    description: '在全 A 中筛选估值偏低、资产负债表相对稳健的价值型标的，适合中长期配置研究。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 15,
    conditions: [
      C('pe', '<=', 20),
      C('pb', '<=', 2.5),
      C('debt_ratio', '<=', 60),
      C('roe', '>=', 8),
    ],
    refinement_notes: '优先行业龙头与盈利稳定性；回避 ST 与高杠杆周期股；匹配度需体现安全边际与现金流质量。',
  },
  {
    id: 'buffett_moat',
    name: '巴菲特护城河',
    category: 'quality',
    tagline: '高质量 · 高 ROE + 盈利韧性',
    methodology: '参考 Warren Buffett 护城河与 ROE 长期维持框架；结合毛利率、负债与盈利增长。',
    description: '寻找具备持续竞争优势、盈利能力强且财务保守的优质公司。',
    scorecard: '综合评估',
    prescreen_top_n: 70,
    final_top_n: 12,
    conditions: [
      C('roe', '>=', 15),
      C('gross_margin', '>=', 30),
      C('debt_ratio', '<=', 50),
      C('net_profit_yoy', '>=', 0),
    ],
    refinement_notes: '优先 ROE 稳定、毛利率领先、行业地位明确的龙头；评估护城河可持续性而非短期景气。',
  },
  {
    id: 'lynch_garp',
    name: '林奇 GARP',
    category: 'growth',
    tagline: '合理价格成长 · PEG 与盈利 CAGR',
    methodology: '参考 Peter Lynch GARP：成长性与估值匹配；PEG 与中长期利润复合增速。',
    description: '在成长股票中筛选估值尚未透支、盈利增长可验证的 GARP 标的。',
    scorecard: '综合评估',
    prescreen_top_n: 70,
    final_top_n: 15,
    conditions: [
      C('peg', '<=', 1.5),
      C('profit_cagr_3y', '>=', 12),
      C('roe', '>=', 10),
      C('pe', '<=', 40),
    ],
    refinement_notes: '平衡成长速度与估值；优先盈利增速可延续、行业景气度向上的标的。',
  },
  {
    id: 'fama_french_quality',
    name: 'Fama-French 质量因子',
    category: 'quality',
    tagline: '学术质量因子 · 盈利 + 低杠杆',
    methodology: '参考 Fama-French Quality Minus Junk：高盈利、低杠杆、盈利增长的质量溢价。',
    description: '基于学术质量因子组合逻辑，筛选高质量、低投机属性的 A 股标的。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 15,
    conditions: [
      C('roe', '>=', 14),
      C('debt_ratio', '<=', 55),
      C('net_profit_yoy', '>=', 5),
      C('gross_margin', '>=', 20),
    ],
    refinement_notes: '强调盈利质量与资本结构；优先因子一致性高、非单一季度脉冲的标的。',
  },
  {
    id: 'msci_quality',
    name: 'MSCI 质量蓝筹',
    category: 'quality',
    tagline: '大盘质量 · ROE 趋势 + 盈利能力',
    methodology: '参考 MSCI Quality Index 思路：高 ROE、盈利波动低、低杠杆（以本地因子近似）。',
    description: '偏大盘蓝筹质量风格，适合稳健型组合的核心仓位挖掘。',
    scorecard: '综合评估',
    prescreen_top_n: 60,
    final_top_n: 12,
    conditions: [
      C('roe', '>=', 12),
      C('roe_trend', '>', 0),
      C('gross_margin', '>=', 25),
      C('debt_ratio', '<=', 55),
    ],
    refinement_notes: '优先市值与流动性较好、行业龙头；关注 ROE 趋势改善而非单季异常。',
  },
  {
    id: 'jegadeesh_momentum',
    name: 'Jegadeesh 动量',
    category: 'momentum',
    tagline: '中期动量 · 6 月趋势延续',
    methodology: '参考 Jegadeesh & Titman 动量效应；6 月/3 月价格动量与量能配合。',
    description: '捕捉中期趋势强劲的标的，适合趋势跟踪与波段研究（需注意反转风险）。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 15,
    conditions: [
      C('momentum_6m', '>', 8),
      C('momentum_3m', '>', 3),
      C('volume_ratio', '>=', 1.1),
    ],
    refinement_notes: '优先趋势连贯、量价配合；回避涨幅过大且估值极端透支的标的；提示动量回撤风险。',
  },
  {
    id: 'low_vol_value',
    name: '低波价值',
    category: 'balanced',
    tagline: '防御价值 · 低估值 + 温和动量',
    methodology: '结合 Low-Volatility Anomaly 与价值因子；低 PE/PB，避免短期暴跌形态。',
    description: '偏防御的价值组合研究，适合震荡市与回撤控制场景。',
    scorecard: '综合评估',
    prescreen_top_n: 70,
    final_top_n: 12,
    conditions: [
      C('pe', '<=', 22),
      C('pb', '<=', 2.8),
      C('momentum_1m', '>', -5),
      C('debt_ratio', '<=', 60),
    ],
    refinement_notes: '优先分红稳定、波动相对较低的价值股；兼顾估值安全边际。',
  },
  {
    id: 'earnings_acceleration',
    name: '盈利加速',
    category: 'growth',
    tagline: '业绩拐点 · 净利同比 + CAGR',
    methodology: '参考投行盈利修正与 Earnings Momentum 框架；净利同比与 3 年 CAGR 双验证。',
    description: '挖掘盈利正在加速增长的公司，适合业绩驱动型投资研究。',
    scorecard: '综合评估',
    prescreen_top_n: 75,
    final_top_n: 15,
    conditions: [
      C('net_profit_yoy', '>=', 20),
      C('profit_cagr_3y', '>=', 15),
      C('roe_trend', '>', 0),
    ],
    refinement_notes: '区分一次性收益与主业增长；优先营收与利润同步改善的标的。',
  },
  {
    id: 'smart_flow',
    name: '量能共振',
    category: 'momentum',
    tagline: '放量突破 · 量比 + 短期动量',
    methodology: '参考量价技术分析与资金流共振；量比放大配合短期价格动量。',
    description: '筛选资金活跃度提升、短期动能较强的标的，偏交易型研究。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 12,
    conditions: [
      C('volume_ratio', '>=', 1.4),
      C('momentum_1m', '>', 4),
      C('momentum_3m', '>', 0),
    ],
    refinement_notes: '优先放量上涨且基本面无重大瑕疵；明确提示短线波动与流动性风险。',
  },
  {
    id: 'all_weather',
    name: '全天候均衡',
    category: 'balanced',
    tagline: '多因子均衡 · 价值+质量+动量',
    methodology: '参考 Bridgewater 全天候多资产思想（权益侧多因子均衡）；分散单一风格风险。',
    description: '多因子均衡筛选，不极端偏向单一风格，适合广谱挖掘与组合初筛。',
    scorecard: '综合评估',
    prescreen_top_n: 90,
    final_top_n: 20,
    conditions: [
      C('roe', '>=', 10),
      C('pe', '<=', 35),
      C('momentum_6m', '>', 0),
      C('debt_ratio', '<=', 65),
    ],
    refinement_notes: '在各因子维度无极端短板；优先综合评分高、行业分散的标的组合。',
  },
]

export function getDiscoverStrategy(id: string): DiscoverStrategy | undefined {
  return DISCOVER_STRATEGIES.find(s => s.id === id)
}

export function strategyToPlan(strategy: DiscoverStrategy): DiscoverParsedPlan {
  return {
    strategy_title: strategy.name,
    conditions: strategy.conditions,
    prescreen_top_n: strategy.prescreen_top_n,
    final_top_n: strategy.final_top_n,
    refinement_notes: strategy.refinement_notes,
  }
}

export function listDiscoverStrategiesPublic() {
  return DISCOVER_STRATEGIES.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    tagline: s.tagline,
    methodology: s.methodology,
    description: s.description,
    final_top_n: s.final_top_n,
    condition_count: s.conditions.length,
    source: 'builtin' as const,
  }))
}
