/**
 * Composer `/` 技能列表与 chip 的用户可见文案。
 * 优先读 API 返回的 metadata.title / summary / slash-rank；
 * 内置技能另有静态中文标题表，供消息气泡无 metadata 时回退。
 */
import type { PublicAgentSkill } from '../api/client'

/** 与 builtin SKILL.md metadata.title 同步；消息内 `@skill:id` 无映射时回退 name */
export const BUILTIN_SKILL_TITLES: Readonly<Record<string, string>> = {
  'ah-compare': 'AH对照',
  'announcement-deepread': '公告精读',
  'bear-case': '空头情景',
  'browser-browse': '网页浏览',
  'catalyst-calendar': '催化日历',
  'closing-market-brief': '收盘',
  'competitive-moat': '竞争壁垒',
  'comps-analysis': '可比公司',
  'coverage-initiation': '覆盖启动',
  'create-canvas': '投研画布',
  'create-mindmap': '结构脑图',
  'create-skill': '新建技能',
  'create-web': '网页报告',
  'credit-brief': '信用简报',
  'cross-asset': '跨资产对照',
  'dcf-model': 'DCF模型',
  'earnings-quality': '盈利质量',
  'earnings-quick-read': '财报速读',
  'equity-deep-dive': '个股尽调',
  'esg-scan': 'ESG扫描',
  'etf-research': 'ETF研究',
  'execution-cost': '交易成本',
  'expert-synthesis': '机构观点综合',
  'factor-exposure': '因子暴露',
  'factor-research': '因子研究',
  'financial-model': '三表联动模型',
  'football-field': '估值球场图',
  'ic-memo': '投委会备忘',
  'industry-chain': '产业链',
  'instrument-signals': '标的信号',
  'ipo-note': '新股笔记',
  'lean-black-litterman': 'LEAN黑利特曼',
  'lean-capm-alpha-rank': 'LEAN相对基准Alpha',
  'lean-drawdown-risk': 'LEAN回撤风控',
  'lean-ema-cross-universe': 'LEAN均线宇宙',
  'lean-energy-lead-lag': 'LEAN能源领先滞后',
  'lean-equal-weight-pcm': 'LEAN等权组合',
  'lean-etf-constituents': 'LEAN ETF成分宇宙',
  'lean-etf-global-rotation': 'LEAN ETF轮动',
  'lean-etf-ibs-reversion': 'LEAN IBS回归',
  'lean-etf-thematic-baskets': 'LEAN主题ETF篮',
  'lean-framework-pipeline': 'LEAN框架流水线',
  'lean-gap-reversion': 'LEAN跳空回归',
  'lean-indicator-playbook': 'LEAN指标手册',
  'lean-letf-decay': 'LEAN杠杆衰减',
  'lean-ma-cross-trend': 'LEAN均线趋势',
  'lean-macro-reit-alpha': 'LEAN利率地产',
  'lean-magic-formula': 'LEAN质量价值筛选',
  'lean-mean-variance': 'LEAN均值方差',
  'lean-param-grid-optimize': 'LEAN参数网格',
  'lean-pearson-pairs': 'LEAN Pearson配对',
  'lean-qc500-style-screen': 'LEAN流动性筛选',
  'lean-returns-momentum': 'LEAN收益动量',
  'lean-risk-parity': 'LEAN风险平价',
  'lean-rsi-reversion': 'LEAN RSI回归',
  'lean-sector-weighting': 'LEAN行业加权',
  'lean-sentiment-nlp': 'LEAN情绪文本',
  'lean-vix-dual-thrust': 'LEAN波动通道',
  'limit-move-attribution': '涨跌停归因',
  'liquidity-map': '流动性地图',
  'macro-brief': '宏观简报',
  'management-capital': '管理层与资本配置',
  'meeting-notes': '会议纪要',
  'mna-event': '并购事件',
  'morning-market-brief': '早报',
  'multi-role-research-council': '投资研讨团',
  'news-digest': '资讯摘要',
  'northbound-flow': '北向资金',
  'pairs-rv': '配对价差',
  'performance-attribution': '业绩归因',
  'portfolio-review': '组合复盘',
  'precedent-tx': '先例交易',
  'rebalance': '再平衡方案',
  'robustness-check': '稳健性检验',
  'run-backtest': '策略回测',
  'scheduled-jobs': '定时任务',
  'seo-refi': '再融资条款',
  'shareholder-structure': '股东结构',
  'strategy-report': '策略报告',
  'stress-test': '压力测试',
  'style-rotation': '风格轮动',
  'theme-policy-map': '主题政策地图',
  'thesis-memo': '投资备忘',
  'thesis-tracker': '论点跟踪板',
  'thesis-update': '论点更新',
  'universe-screen': '股票池筛选',
  'watchlist-digest': '关注列表摘要',
}

const DEFAULT_SLASH_RANK = 500
const SUMMARY_MAX = 48

type SkillLike = Pick<PublicAgentSkill, 'name' | 'description' | 'metadata'>

export function skillDisplayTitle(skill: SkillLike): string {
  const fromMeta = skill.metadata?.title?.trim()
  if (fromMeta) return fromMeta
  const fromBuiltin = BUILTIN_SKILL_TITLES[skill.name]
  if (fromBuiltin) return fromBuiltin
  return skill.name
}

export function skillDisplaySummary(skill: SkillLike): string {
  const fromMeta = skill.metadata?.summary?.trim()
  if (fromMeta) return fromMeta
  const desc = (skill.description ?? '').trim().replace(/\s+/g, ' ')
  if (!desc) return ''
  if (desc.length <= SUMMARY_MAX) return desc
  return `${desc.slice(0, SUMMARY_MAX)}…`
}

export function skillSlashRank(skill: SkillLike): number {
  const raw = skill.metadata?.['slash-rank']?.trim()
  if (!raw) return DEFAULT_SLASH_RANK
  const n = Number(raw)
  return Number.isFinite(n) ? n : DEFAULT_SLASH_RANK
}

/** 先 slash-rank 升序，再按展示标题 localeCompare */
export function compareSkillsForSlash(a: SkillLike, b: SkillLike): number {
  const rankDiff = skillSlashRank(a) - skillSlashRank(b)
  if (rankDiff !== 0) return rankDiff
  return skillDisplayTitle(a).localeCompare(skillDisplayTitle(b), 'zh')
}

export function skillMatchesSlashQuery(skill: SkillLike, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystacks = [
    skill.name,
    skillDisplayTitle(skill),
    skill.metadata?.summary ?? '',
    skill.description ?? '',
  ]
  return haystacks.some(h => h.toLowerCase().includes(q))
}

/** 消息气泡：`@skill:name` → 中文短标题（无则原 name） */
export function skillTitleForName(name: string): string {
  return BUILTIN_SKILL_TITLES[name] ?? name
}
