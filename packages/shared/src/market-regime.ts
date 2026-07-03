/** 市场状态快照 — 用于发现页策略提示（轻量，非交易信号） */
export type MarketRegimeKind = 'panic' | 'cautious' | 'neutral' | 'euphoria'

export type MarksCycleStage = '极度悲观' | '悲观' | '中性' | '乐观' | '极度乐观'

export type ValuationAnchor = '低估区' | '合理' | '偏贵' | '高估区'

/** 14/15/16 框架的可本地计算指标 */
export interface MarketRegimeIndicators {
  /** 14 宏观背景：沪深300 PE(TTM) */
  index_pe: number | null
  /** 16 Marks：估值锚（PE 分档或价格分位代理） */
  valuation_anchor: ValuationAnchor | null
  /** 16 Marks：周期阶段 */
  marks_cycle: MarksCycleStage | null
  /** 15 情绪：0=极度恐惧，100=极度贪婪 */
  sentiment_score: number | null
  /** 15 恐惧贪婪：相对 125 日均线位置（%） */
  ma125_position_pct: number | null
  /** 15 市场广度：上涨家数占比（%） */
  advance_pct: number | null
  /** 15 量能：成交额相对 20 日均值倍数 */
  turnover_vs_20d: number | null
  /** 15 波动：20 日历史波动率（年化 %） */
  hv20_pct: number | null
  /** 15 微观结构：涨停家数 */
  limit_up: number | null
  /** 15 微观结构：跌停家数 */
  limit_down: number | null
  /** 14/15 跨境资金：北向净流入（亿元） */
  northbound_net_yi: number | null
  /** 指数近 6 月涨跌幅（%） */
  index_m6m: number | null
  /** 指数近 1 月涨跌幅（%） */
  index_m1m: number | null
  /** 16 价格分位代理（近 250 日，%） */
  price_percentile_250d: number | null
}

export interface MarketRegimeSnapshot {
  regime: MarketRegimeKind
  headline: string
  detail: string
  /** 与当前市况更契合的内置挖掘策略 id */
  suggested_strategy_ids: string[]
  indicators: MarketRegimeIndicators
}

export interface MarketRegimeInputs {
  index_m6m: number | null
  index_m1m: number | null
  index_pe?: number | null
  ma125_position_pct?: number | null
  advance_pct?: number | null
  turnover_vs_20d?: number | null
  hv20_pct?: number | null
  limit_up?: number | null
  limit_down?: number | null
  northbound_net_yi?: number | null
  price_percentile_250d?: number | null
}

export interface KlineBar {
  close: number
  amount?: number | null
}

/** 收盘价相对 N 日均线的偏离（%） */
export function computeMaPositionPct(klines: KlineBar[], window = 125): number | null {
  if (klines.length < window) return null
  const slice = klines.slice(-window)
  const last = slice[slice.length - 1]?.close
  if (last == null || last <= 0) return null
  const ma = slice.reduce((s, b) => s + b.close, 0) / slice.length
  if (ma <= 0) return null
  return Math.round(((last / ma) - 1) * 1000) / 10
}

/** 近 window 日收盘价在历史窗口中的分位（0-100） */
export function computePricePercentile(klines: KlineBar[], window = 250): number | null {
  if (klines.length < 30) return null
  const slice = klines.slice(-Math.min(window, klines.length))
  const last = slice[slice.length - 1]?.close
  if (last == null) return null
  const sorted = slice.map(b => b.close).sort((a, b) => a - b)
  const rank = sorted.filter(v => v <= last).length
  return Math.round((rank / sorted.length) * 1000) / 10
}

/** 成交额相对近 20 日均值倍数 */
export function computeTurnoverVs20d(klines: KlineBar[]): number | null {
  const amounts = klines.map(b => b.amount).filter((v): v is number => v != null && v > 0)
  if (amounts.length < 21) return null
  const recent = amounts.slice(-21)
  const last = recent[recent.length - 1]!
  const avg = recent.slice(0, -1).reduce((s, v) => s + v, 0) / (recent.length - 1)
  if (avg <= 0) return null
  return Math.round((last / avg) * 100) / 100
}

/** 20 日历史波动率（年化 %） */
export function computeHv20Pct(klines: KlineBar[]): number | null {
  if (klines.length < 21) return null
  const closes = klines.slice(-21).map(b => b.close)
  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!
    const cur = closes[i]!
    if (prev > 0) rets.push(Math.log(cur / prev))
  }
  if (rets.length < 5) return null
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length
  return Math.round(Math.sqrt(variance) * Math.sqrt(252) * 1000) / 10
}

/** 16 Marks：由沪深300 PE 判断周期阶段 */
export function computeMarksCycle(indexPe: number | null, pricePercentile: number | null): MarksCycleStage | null {
  if (indexPe != null && indexPe > 0) {
    if (indexPe < 10) return '极度悲观'
    if (indexPe < 12) return '悲观'
    if (indexPe < 14) return '中性'
    if (indexPe < 17) return '乐观'
    return '极度乐观'
  }
  if (pricePercentile != null) {
    if (pricePercentile < 10) return '极度悲观'
    if (pricePercentile < 25) return '悲观'
    if (pricePercentile < 60) return '中性'
    if (pricePercentile < 85) return '乐观'
    return '极度乐观'
  }
  return null
}

export function computeValuationAnchor(
  indexPe: number | null,
  pricePercentile: number | null,
): ValuationAnchor | null {
  if (indexPe != null && indexPe > 0) {
    if (indexPe < 11) return '低估区'
    if (indexPe < 14) return '合理'
    if (indexPe < 17) return '偏贵'
    return '高估区'
  }
  if (pricePercentile != null) {
    if (pricePercentile < 20) return '低估区'
    if (pricePercentile < 55) return '合理'
    if (pricePercentile < 80) return '偏贵'
    return '高估区'
  }
  return null
}

/**
 * 15 情绪综合分（0-100，越高越贪婪）。
 * 多指标共振：动量、广度、波动、涨跌停、北向、均线位置。
 */
export function computeSentimentScore(input: {
  ma125_position_pct: number | null
  advance_pct: number | null
  hv20_pct: number | null
  limit_up: number | null
  limit_down: number | null
  northbound_net_yi: number | null
  index_m6m: number | null
  turnover_vs_20d: number | null
}): number | null {
  const parts: { score: number; weight: number }[] = []

  if (input.ma125_position_pct != null) {
    const s = Math.max(0, Math.min(100, 50 + input.ma125_position_pct * 2))
    parts.push({ score: s, weight: 0.2 })
  }
  if (input.advance_pct != null) {
    parts.push({ score: Math.max(0, Math.min(100, input.advance_pct)), weight: 0.2 })
  }
  if (input.hv20_pct != null) {
    const s = Math.max(0, Math.min(100, 100 - (input.hv20_pct - 12) * 3))
    parts.push({ score: s, weight: 0.15 })
  }
  if (input.limit_up != null || input.limit_down != null) {
    const up = input.limit_up ?? 0
    const down = input.limit_down ?? 0
    const total = up + down
    const s = total > 0 ? Math.max(0, Math.min(100, (up / total) * 100)) : 50
    parts.push({ score: s, weight: 0.15 })
  }
  if (input.northbound_net_yi != null) {
    const s = Math.max(0, Math.min(100, 50 + input.northbound_net_yi * 5))
    parts.push({ score: s, weight: 0.1 })
  }
  if (input.index_m6m != null) {
    const s = Math.max(0, Math.min(100, 50 + input.index_m6m * 1.5))
    parts.push({ score: s, weight: 0.1 })
  }
  if (input.turnover_vs_20d != null) {
    const s = Math.max(0, Math.min(100, 40 + (input.turnover_vs_20d - 1) * 40))
    parts.push({ score: s, weight: 0.1 })
  }

  if (!parts.length) return null
  const wsum = parts.reduce((s, p) => s + p.weight, 0)
  const total = parts.reduce((s, p) => s + p.score * p.weight, 0)
  return Math.round(total / wsum)
}

function buildIndicators(input: MarketRegimeInputs): MarketRegimeIndicators {
  const pricePercentile = input.price_percentile_250d ?? null
  const indexPe = input.index_pe ?? null
  return {
    index_pe: indexPe,
    valuation_anchor: computeValuationAnchor(indexPe, pricePercentile),
    marks_cycle: computeMarksCycle(indexPe, pricePercentile),
    sentiment_score: computeSentimentScore({
      ma125_position_pct: input.ma125_position_pct ?? null,
      advance_pct: input.advance_pct ?? null,
      hv20_pct: input.hv20_pct ?? null,
      limit_up: input.limit_up ?? null,
      limit_down: input.limit_down ?? null,
      northbound_net_yi: input.northbound_net_yi ?? null,
      index_m6m: input.index_m6m,
      turnover_vs_20d: input.turnover_vs_20d ?? null,
    }),
    ma125_position_pct: input.ma125_position_pct ?? null,
    advance_pct: input.advance_pct ?? null,
    turnover_vs_20d: input.turnover_vs_20d ?? null,
    hv20_pct: input.hv20_pct ?? null,
    limit_up: input.limit_up ?? null,
    limit_down: input.limit_down ?? null,
    northbound_net_yi: input.northbound_net_yi ?? null,
    index_m6m: input.index_m6m,
    index_m1m: input.index_m1m,
    price_percentile_250d: pricePercentile,
  }
}

/**
 * 综合 14 宏观背景、15 情绪、16 Marks 周期与指数动量判断市况。
 * 社融、M1-M2、iVIX 等需外部数据源，见 docs/RIGHT-PANEL-RESEARCH-PLAN.md § 待办事项。
 */
export function computeMarketRegime(input: MarketRegimeInputs): MarketRegimeSnapshot {
  const indicators = buildIndicators(input)
  const { index_m6m: m6, index_m1m: m1 } = input
  const sentiment = indicators.sentiment_score
  const cycle = indicators.marks_cycle

  const panicSignals = [
    sentiment != null && sentiment <= 22,
    m6 != null && m6 <= -12,
    m1 != null && m1 <= -6 && m6 != null && m6 <= -5,
    cycle === '极度悲观',
    indicators.advance_pct != null && indicators.advance_pct < 25
      && indicators.limit_down != null && indicators.limit_down > 50,
  ].filter(Boolean).length

  const euphoriaSignals = [
    sentiment != null && sentiment >= 78,
    m6 != null && m6 >= 18 && m1 != null && m1 >= 4,
    cycle === '极度乐观',
    indicators.limit_up != null && indicators.limit_up > 80
      && indicators.advance_pct != null && indicators.advance_pct > 75,
  ].filter(Boolean).length

  if (panicSignals >= 2 || (panicSignals >= 1 && cycle === '极度悲观')) {
    return {
      regime: 'panic',
      headline: '市场偏恐慌',
      detail: buildDetail(
        '指数回撤与情绪指标偏冷，可优先「恐慌反弹」「低波价值」等防守与反转挖掘；追高动量需谨慎。',
        indicators,
      ),
      suggested_strategy_ids: ['fear_rebound', 'low_vol_value', 'graham_margin'],
      indicators,
    }
  }

  if (euphoriaSignals >= 2 || (euphoriaSignals >= 1 && cycle === '极度乐观')) {
    return {
      regime: 'euphoria',
      headline: '市场偏亢奋',
      detail: buildDetail(
        '情绪与估值偏热，宜侧重质量与估值纪律；动量类策略需警惕回撤。',
        indicators,
      ),
      suggested_strategy_ids: ['buffett_moat', 'msci_quality', 'gbm_core'],
      indicators,
    }
  }

  if (
    (sentiment != null && sentiment <= 38)
    || (m6 != null && m6 <= -4)
    || cycle === '悲观'
  ) {
    return {
      regime: 'cautious',
      headline: '市场偏谨慎',
      detail: buildDetail(
        '宏观背景偏弱或情绪偏冷，可多因子均衡挖掘，兼顾基本面与适度动量。',
        indicators,
      ),
      suggested_strategy_ids: ['gbm_core', 'all_weather', 'low_vol_value'],
      indicators,
    }
  }

  return {
    regime: 'neutral',
    headline: '市场中性',
    detail: buildDetail(
      '多数指标处于常态区间，可按风格自由选择；「G=B+M 核心池」适合广谱初筛。',
      indicators,
    ),
    suggested_strategy_ids: ['gbm_core', 'all_weather'],
    indicators,
  }
}

export type MarketRegimeScope = 'cn' | 'us'

/** 从指数 K 线提取动量/波动输入 — 用于 US 等非 A 股市场况 stub */
export function momentumRegimeInputsFromKlines(klines: KlineBar[]): MarketRegimeInputs {
  let indexM6m: number | null = null
  let indexM1m: number | null = null
  if (klines.length >= 21) {
    const last = klines[klines.length - 1]?.close
    const m1Base = klines[Math.max(0, klines.length - 21)]?.close
    if (last != null && m1Base != null && m1Base > 0) {
      indexM1m = Math.round((last / m1Base - 1) * 1000) / 10
    }
  }
  if (klines.length >= 121) {
    const last = klines[klines.length - 1]?.close
    const m6Base = klines[klines.length - 121]?.close
    if (last != null && m6Base != null && m6Base > 0) {
      indexM6m = Math.round((last / m6Base - 1) * 1000) / 10
    }
  }
  return {
    index_m6m: indexM6m,
    index_m1m: indexM1m,
    ma125_position_pct: computeMaPositionPct(klines, 125),
    turnover_vs_20d: computeTurnoverVs20d(klines),
    hv20_pct: computeHv20Pct(klines),
    price_percentile_250d: computePricePercentile(klines, 250),
  }
}

function buildDetail(base: string, ind: MarketRegimeIndicators): string {
  const hints: string[] = []
  if (ind.marks_cycle) hints.push(`周期：${ind.marks_cycle}`)
  if (ind.valuation_anchor) hints.push(`估值：${ind.valuation_anchor}`)
  if (ind.sentiment_score != null) hints.push(`情绪 ${ind.sentiment_score}`)
  if (ind.advance_pct != null) hints.push(`上涨占比 ${ind.advance_pct.toFixed(0)}%`)
  if (hints.length) return `${base}（${hints.join(' · ')}）`
  return base
}
