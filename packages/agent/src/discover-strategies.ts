import type { DiscoverStrategyProfile, MarketDataPackId } from '@opptrix/shared'
import { ETF_SCORECARD_NAME, isDiscoverProfileMiningReady, discoverPrescreenMode, discoverProfileAssetLabel } from '@opptrix/shared'
import type { DiscoverParsedPlan, DiscoverScreenCondition } from './discover.js'

export type DiscoverStrategyCategory = 'value' | 'growth' | 'quality' | 'momentum' | 'balanced' | 'contrarian'

export type DiscoverPlanMode = 'llm' | 'builtin'

export interface DiscoverStrategy {
  id: string
  name: string
  category: DiscoverStrategyCategory
  tagline: string
  methodology: string
  description: string
  scorecard: string
  prescreen_top_n: number
  final_top_n: number
  conditions: DiscoverScreenCondition[]
  refinement_notes: string
  applicableProfiles: DiscoverStrategyProfile[]
  requiresPack: MarketDataPackId[]
  planMode: DiscoverPlanMode
  /** 美股 / Crypto 本地列表筛选参数（builtin 策略） */
  screen_params?: Record<string, string>
}

const C = (factor: string, op: DiscoverScreenCondition['op'], value: number): DiscoverScreenCondition =>
  ({ factor, op, value })


type StrategyCore = Omit<DiscoverStrategy, 'applicableProfiles' | 'requiresPack' | 'planMode'> & {
  planMode?: DiscoverPlanMode
}


function cnEtf(s: StrategyCore): DiscoverStrategy {
  return {
    ...s,
    applicableProfiles: ['cn_etf'],
    requiresPack: ['cn'],
    planMode: 'builtin',
    scorecard: s.scorecard || ETF_SCORECARD_NAME,
  }
}

function usEquity(s: Omit<StrategyCore, 'conditions'> & { conditions?: DiscoverScreenCondition[]; screen_params?: Record<string, string> }): DiscoverStrategy {
  return {
    ...s,
    conditions: s.conditions ?? [],
    applicableProfiles: ['us_equity'],
    requiresPack: ['us'],
    planMode: 'builtin',
    screen_params: s.screen_params,
  }
}

function cryptoSpot(s: Omit<StrategyCore, 'conditions'> & { conditions?: DiscoverScreenCondition[]; screen_params?: Record<string, string> }): DiscoverStrategy {
  return {
    ...s,
    conditions: s.conditions ?? [],
    applicableProfiles: ['crypto_spot'],
    requiresPack: ['crypto'],
    planMode: 'builtin',
    scorecard: s.scorecard || '综合评估',
    screen_params: s.screen_params,
  }
}

function regionalEquity(
  profile: 'jp_equity' | 'kr_equity' | 'hk_equity',
  pack: MarketDataPackId,
  s: Omit<StrategyCore, 'conditions'> & { conditions?: DiscoverScreenCondition[]; screen_params?: Record<string, string> },
): DiscoverStrategy {
  return {
    ...s,
    conditions: s.conditions ?? [],
    applicableProfiles: [profile],
    requiresPack: [pack],
    planMode: 'builtin',
    scorecard: s.scorecard || '综合评估',
    screen_params: s.screen_params,
  }
}

export const DISCOVER_STRATEGIES: DiscoverStrategy[] = [
  cnEtf({
    id: 'etf_low_premium',
    name: '低折溢价优选',
    category: 'value',
    tagline: '贴近净值 · 折溢价可控',
    methodology: 'ETF 配置核心逻辑：折溢价接近 0 时买卖成本更低；配合一定规模门槛。',
    description: '在本地 ETF 库中筛选折溢价偏离较小、规模达标的 ETF，适合底仓与定投研究。',
    scorecard: 'ETF决策雷达',
    prescreen_top_n: 60,
    final_top_n: 12,
    conditions: [
      C('premium_rate', '<=', 0.5),
      C('scale_yi', '>=', 5),
    ],
    refinement_notes: '优先宽基与主流行业 ETF；折溢价极端时提示交易时机风险；结合决策雷达同类相对维度。',
  }),
  cnEtf({
    id: 'etf_scale_core',
    name: '大盘流动性核心',
    category: 'quality',
    tagline: '规模优先 · 流动性与跟踪稳定性',
    methodology: '参考机构 ETF 配置：规模与成交额决定冲击成本；大盘 ETF 优先。',
    description: '筛选规模较大、流动性较好的 A 股 ETF，适合核心配置与工具型研究。',
    scorecard: 'ETF决策雷达',
    prescreen_top_n: 50,
    final_top_n: 10,
    conditions: [
      C('scale_yi', '>=', 20),
      C('premium_rate', '<=', 1),
    ],
    refinement_notes: '优先沪深300、中证500、红利等主流宽基；同类 ETF 对比费率与跟踪误差。',
  }),
  cnEtf({
    id: 'etf_broad_base',
    name: '宽基均衡池',
    category: 'balanced',
    tagline: '宽基 ETF · 折溢价 + 规模均衡',
    methodology: '宽基指数 ETF 分散配置思路：规模适中、折溢价温和、同类可比。',
    description: '均衡筛选宽基类 ETF，适合观察池与资产配置初筛。',
    scorecard: 'ETF决策雷达',
    prescreen_top_n: 40,
    final_top_n: 8,
    conditions: [
      C('scale_yi', '>=', 10),
      C('premium_rate', '<=', 0.8),
    ],
    refinement_notes: '关注跟踪指数代表性；提示行业/主题 ETF 与宽基的风险差异。',
  }),
  usEquity({
    id: 'us_broad_universe',
    name: '美股广谱观察',
    category: 'balanced',
    tagline: '本地美股列表 · 广谱初筛',
    methodology: '基于本地 us_list 同步结果，按 ticker 排序取广谱样本，Agent 结合行情与公司概况精选。',
    description: '从本地美股库中广谱初选，适合建立美股观察池与主题研究起点。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 15,
    conditions: [],
    refinement_notes: '优先流动性好、业务清晰的大中盘；回避 OTC 与信息极度匮乏标的。',
  }),
  usEquity({
    id: 'us_tech_focus',
    name: '美股科技聚焦',
    category: 'growth',
    tagline: 'Technology 行业 · 本地筛选',
    methodology: '本地 instruments.extra.industry 含 Technology 的美股列表，Agent 结合 snapshot 与财报摘要解读。',
    description: '聚焦科技行业美股，适合跟踪软件、半导体、互联网等主题。',
    scorecard: '综合评估',
    prescreen_top_n: 60,
    final_top_n: 12,
    conditions: [],
    screen_params: { industry_contains: 'Technology' },
    refinement_notes: '区分平台型与周期型科技；提示估值与盈利质量差异，勿推荐买卖。',
  }),
  cryptoSpot({
    id: 'crypto_usdt_majors',
    name: 'USDT 主流对',
    category: 'momentum',
    tagline: 'USDT 计价 · 本地交易对池',
    methodology: '本地 Crypto instruments 中 USDT 计价对，Agent 结合行情与 K 线做研究解读。',
    description: '从本地 USDT 交易对中初选，适合观察主流 Crypto 标的。',
    scorecard: '综合评估',
    prescreen_top_n: 60,
    final_top_n: 12,
    conditions: [],
    screen_params: { quote: 'USDT' },
    refinement_notes: '优先流动性与认知度较高的基础币；提示 7×24 波动与杠杆风险，勿推荐买卖。',
  }),
  cryptoSpot({
    id: 'crypto_btc_quote',
    name: 'BTC 计价对',
    category: 'balanced',
    tagline: 'BTC 计价 · 本地筛选',
    methodology: '本地 BTC 计价交易对列表，适合观察以 BTC 为锚的 alt 生态。',
    description: '筛选 BTC 计价交易对，适合研究 BTC 生态相关标的。',
    scorecard: '综合评估',
    prescreen_top_n: 40,
    final_top_n: 10,
    conditions: [],
    screen_params: { quote: 'BTC' },
    refinement_notes: '注意小市值 alt 流动性；仅研究与数据解读，勿推荐买卖。',
  }),
  regionalEquity('jp_equity', 'jp', {
    id: 'jp_broad_universe',
    name: '日股广谱观察',
    category: 'balanced',
    tagline: '本地日股列表 · 广谱初筛',
    methodology: '基于本地 jp_list 同步结果，按代码排序取广谱样本，Agent 结合快照精选。',
    description: '从本地日股库中广谱初选，适合建立日本市场观察池。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 15,
    conditions: [],
    refinement_notes: '优先流动性与业务清晰度；回避信息极度匮乏标的。',
  }),
  regionalEquity('kr_equity', 'kr', {
    id: 'kr_broad_universe',
    name: '韩股广谱观察',
    category: 'balanced',
    tagline: '本地韩股列表 · 广谱初筛',
    methodology: '基于本地 kr_list 同步结果，按代码排序取广谱样本，Agent 结合快照精选。',
    description: '从本地韩股库中广谱初选，适合建立韩国市场观察池。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 15,
    conditions: [],
    refinement_notes: '优先流动性与业务清晰度；回避信息极度匮乏标的。',
  }),
  regionalEquity('hk_equity', 'hk', {
    id: 'hk_broad_universe',
    name: '港股广谱观察',
    category: 'balanced',
    tagline: '本地港股列表 · 广谱初筛',
    methodology: '基于本地 hk_list 同步结果，按代码排序取广谱样本，Agent 结合快照精选。',
    description: '从本地港股库中广谱初选，适合建立港股市场观察池。',
    scorecard: '综合评估',
    prescreen_top_n: 80,
    final_top_n: 15,
    conditions: [],
    refinement_notes: '优先流动性与业务清晰度；回避信息极度匮乏标的。',
  }),
]

export function primaryDiscoverProfile(strategy: DiscoverStrategy): DiscoverStrategyProfile {
  return strategy.applicableProfiles[0] ?? 'cn_etf'
}

export function getDiscoverStrategy(id: string): DiscoverStrategy | undefined {
  return DISCOVER_STRATEGIES.find(s => s.id === id)
}

export function listDiscoverStrategiesPublic(profile?: DiscoverStrategyProfile) {
  const list = profile
    ? DISCOVER_STRATEGIES.filter(s => s.applicableProfiles.includes(profile))
    : DISCOVER_STRATEGIES
  return list.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    tagline: s.tagline,
    methodology: s.methodology,
    description: s.description,
    final_top_n: s.final_top_n,
    condition_count: s.conditions.length,
    source: 'builtin' as const,
    profile: primaryDiscoverProfile(s),
    applicable_profiles: s.applicableProfiles,
    requires_pack: s.requiresPack,
    mining_ready: s.applicableProfiles.some(isDiscoverProfileMiningReady),
  }))
}

export function buildStrategyExecutionPrompt(strategy: DiscoverStrategy): string {
  const profile = primaryDiscoverProfile(strategy)
  const ref = strategy.conditions
    .map(c => `${c.factor} ${c.op} ${c.value}`)
    .join('；')
  const assetHint = discoverProfileAssetLabel(profile)
  return [
    `【策略】${strategy.name}`,
    `【资产类型】${assetHint}`,
    `【方法论】${strategy.methodology}`,
    `【执行说明】${strategy.description}`,
    `【挖掘侧重】${strategy.refinement_notes}`,
    ref ? `【参考因子示例（可按策略语义调整阈值）】${ref}` : '',
    `【规模】初选约 ${strategy.prescreen_top_n} 只，最终精选 ${strategy.final_top_n} 只。`,
    profile === 'cn_etf'
      ? '请输出用于 ETF 在线筛选的量化 conditions（1-5 条），因子仅限 premium_rate、scale_yi；保留 refinement_notes。'
      : discoverPrescreenMode(profile) === 'list_filter'
        ? '请输出 screen_params（keyword 和/或 industry_contains 至少一项），保留 refinement_notes。'
        : discoverPrescreenMode(profile) === 'blocked'
          ? '该资产类型暂不支持自动初选；请保留 refinement_notes。'
          : '请根据策略语义输出量化 conditions（1-5 条），并保留 refinement_notes。',
  ].filter(Boolean).join('\n')
}

export function strategyToPlan(strategy: DiscoverStrategy): DiscoverParsedPlan {
  return {
    strategy_title: strategy.name,
    conditions: strategy.conditions,
    prescreen_top_n: strategy.prescreen_top_n,
    final_top_n: strategy.final_top_n,
    refinement_notes: strategy.refinement_notes,
    profile: primaryDiscoverProfile(strategy),
    screen_params: strategy.screen_params,
  }
}
