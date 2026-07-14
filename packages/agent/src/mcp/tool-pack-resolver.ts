import type { ToolPackId } from '@opptrix/shared'
import type { SessionContextRef } from '../sessions.js'

/** 除 core/meta 外，首轮播种最多业务 pack 数 */
export const MAX_SEEDED_BUSINESS_PACKS = 2

export interface ToolPackResolveInput {
  message: string
  /** 会话上下文中的标的 / 文章等 */
  contextRef?: SessionContextRef | null
}

interface SeedRule {
  pack: ToolPackId
  /** 命中任一模式即计分 */
  patterns: RegExp[]
  weight: number
}

const SEED_RULES: SeedRule[] = [
  {
    pack: 'portfolio',
    weight: 3,
    patterns: [
      /持仓|关注列表|自选|组合|盈亏|成本价|买卖流水|portfolio|watchlist/i,
      /我的股票|我买了|仓位/,
    ],
  },
  {
    pack: 'etf',
    weight: 3,
    patterns: [
      /\bETF\b|交易所交易基金|净值|溢价率|折价|联接基金|场内基金/i,
      /持仓.*权重|成分股.*ETF/i,
    ],
  },
  {
    pack: 'news',
    weight: 3,
    patterns: [
      /资讯|新闻|公告|研报|订阅|RSS|新闻中心|notice|disclosure/i,
      /看好空|舆情|媒体报道/,
    ],
  },
  {
    pack: 'industry',
    weight: 3,
    patterns: [
      /产业[链路]|上下游|行业透视|板块龙头|主题观察|mermaid/i,
      /半导体|新能源车|光伏|锂电.*产业/,
    ],
  },
  {
    pack: 'market',
    weight: 2,
    patterns: [
      /大盘|宏观|牛熊|市场[状动情]|板块轮动|涨跌榜|龙虎榜|开盘|收盘|早报|复盘/i,
      /沪深300|风险偏好|市场状态/,
    ],
  },
  {
    pack: 'instrument_analytics',
    weight: 2,
    patterns: [
      /分析|评估|评分|打分|技术面|策略信号|指标|筹码|机构评级|好不好|怎么看|值不值得/i,
      /evaluate|signal|indicator/i,
    ],
  },
  {
    pack: 'strategy_extra',
    weight: 2,
    patterns: [/回测|IC\b|策略报告|backtest/i],
  },
  {
    pack: 'provider_ext',
    weight: 1,
    patterns: [/自定义方法|provider|数据源扩展|akshare|baostock|zzshare/i],
  },
]

/** A 股 6 位码 / 命名空间标的 → 倾向加载深度分析 */
const CN_CODE_RE = /(?:^|[^\d])([036]\d{5})(?:[^\d]|$)/
const NS_REF_RE = /\b(?:CN|US|HK|CRYPTO):[A-Z0-9./]+\b/i

function scoreMessage(message: string): Map<ToolPackId, number> {
  const scores = new Map<ToolPackId, number>()
  const text = message.trim()
  if (!text) return scores

  for (const rule of SEED_RULES) {
    let hit = false
    for (const re of rule.patterns) {
      if (re.test(text)) {
        hit = true
        break
      }
    }
    if (hit) {
      scores.set(rule.pack, (scores.get(rule.pack) ?? 0) + rule.weight)
    }
  }

  if (CN_CODE_RE.test(text) || NS_REF_RE.test(text)) {
    scores.set(
      'instrument_analytics',
      (scores.get('instrument_analytics') ?? 0) + 2,
    )
  }

  return scores
}

function scoreContext(contextRef?: SessionContextRef | null): Map<ToolPackId, number> {
  const scores = new Map<ToolPackId, number>()
  if (!contextRef) return scores

  if (contextRef.kind === 'article') {
    scores.set('news', 3)
  }

  if (contextRef.kind === 'selection' || contextRef.kind === 'fork') {
    const text = contextRef.preview || ('selectedText' in contextRef ? contextRef.selectedText : '')
    if (text && (CN_CODE_RE.test(text) || NS_REF_RE.test(text) || /分析|评估|走势/.test(text))) {
      scores.set('instrument_analytics', 2)
    }
    if (text && /\bETF\b|净值/i.test(text)) scores.set('etf', 2)
    if (text && /资讯|公告|新闻/.test(text)) scores.set('news', 2)
  }

  return scores
}

function mergeScores(...maps: Map<ToolPackId, number>[]): Map<ToolPackId, number> {
  const out = new Map<ToolPackId, number>()
  for (const m of maps) {
    for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v)
  }
  return out
}

/**
 * 确定性意图播种：返回业务 pack（不含 always-on core/meta），最多 MAX_SEEDED_BUSINESS_PACKS 个。
 */
export function resolveSeedPacks(input: ToolPackResolveInput): ToolPackId[] {
  const merged = mergeScores(scoreMessage(input.message), scoreContext(input.contextRef))
  const ranked = [...merged.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return ranked.slice(0, MAX_SEEDED_BUSINESS_PACKS).map(([id]) => id)
}

/** @deprecated 使用 resolveSeedPacks；保留别名便于测试 */
export const ToolPackResolver = {
  resolve: resolveSeedPacks,
  maxBusinessPacks: MAX_SEEDED_BUSINESS_PACKS,
}
