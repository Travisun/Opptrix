import type { StockKline } from '@opptrix/shared'
import { computeAll, type IndicatorRow } from './indicators.js'
import { maxDrawdown, sharpeRatio } from './portfolio/risk.js'

export type TrendStripTone = 'bullish' | 'bearish' | 'neutral' | 'caution' | 'muted'

export interface TrendStrip {
  id: string
  group: 'trend' | 'volume' | 'risk' | 'aux' | 'holding'
  title: string
  status: string
  detail: string
  tone: TrendStripTone
}

export interface TrendBriefInput {
  code: string
  name: string
  klines: StockKline[]
  indexKlines?: StockKline[]
  livePrice?: number | null
  holdingCost?: number | null
}

export interface TrendBriefData {
  code: string
  name: string
  as_of: string
  data_days: number
  strips: TrendStrip[]
}

const GROUP_ORDER: TrendStrip['group'][] = ['trend', 'volume', 'risk', 'holding', 'aux']

export const TREND_GROUP_LABELS: Record<TrendStrip['group'], string> = {
  trend: '趋势结构',
  volume: '量价行为',
  risk: '风险收益',
  holding: '持仓参考',
  aux: '辅助参考',
}

function pctText(n: number, digits = 1): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

function fmtDate(d: string): string {
  const m = d.match(/(\d{4})-?(\d{2})-?(\d{2})/)
  if (!m) return d
  return `${Number(m[2])}月${Number(m[3])}日`
}

function changePctAt(klines: StockKline[], i: number): number {
  const row = klines[i]
  if (row.changePct != null && Number.isFinite(row.changePct)) return row.changePct
  if (i <= 0) return 0
  const prev = klines[i - 1].close
  if (prev <= 0) return 0
  return ((row.close - prev) / prev) * 100
}

function returnOverDays(closes: number[], days: number): number | null {
  if (closes.length < days + 1) return null
  const start = closes[closes.length - 1 - days]
  const end = closes[closes.length - 1]
  if (start <= 0) return null
  return ((end - start) / start) * 100
}

function volumeVsMa5(klines: StockKline[], i: number): number | null {
  if (i < 4) return null
  let sum = 0
  for (let j = i - 4; j <= i; j++) sum += klines[j].volume ?? 0
  const ma5 = sum / 5
  const vol = klines[i].volume ?? 0
  if (ma5 <= 0) return null
  return vol / ma5
}

function stripMaStructure(price: number, row: IndicatorRow): TrendStrip {
  const { ma5, ma10, ma20, ma60 } = row
  if (ma5 != null && ma10 != null && ma20 != null && price > ma5 && ma5 > ma10 && ma10 > ma20) {
    return {
      id: 'ma_structure',
      group: 'trend',
      title: '短期趋势',
      status: '均线多头排列',
      detail: '价格在短中期均线之上，且均线自上而下依次发散，短期走势偏强。',
      tone: 'bullish',
    }
  }
  if (ma5 != null && ma10 != null && ma20 != null && price < ma5 && ma5 < ma10 && ma10 < ma20) {
    return {
      id: 'ma_structure',
      group: 'trend',
      title: '短期趋势',
      status: '均线空头排列',
      detail: '价格落在短中期均线之下，均线呈空头排列，短期承压。',
      tone: 'bearish',
    }
  }
  return {
    id: 'ma_structure',
    group: 'trend',
    title: '短期趋势',
    status: '均线交织震荡',
    detail: '短中期均线未形成一致方向，股价可能在区间内整理，宜观察能否重新站稳关键均线。',
    tone: 'neutral',
  }
}

function stripMa60(price: number, row: IndicatorRow): TrendStrip {
  const ma60 = row.ma60
  if (ma60 == null || ma60 <= 0) {
    return {
      id: 'ma60',
      group: 'trend',
      title: '中期位置',
      status: '数据不足',
      detail: '上市或交易历史较短，暂无法判断 60 日线位置。',
      tone: 'muted',
    }
  }
  const diff = ((price - ma60) / ma60) * 100
  if (diff >= 2) {
    return {
      id: 'ma60',
      group: 'trend',
      title: '中期位置',
      status: '运行在 60 日线之上',
      detail: `当前价较 60 日线高约 ${diff.toFixed(1)}%，中期趋势尚未破坏。`,
      tone: 'bullish',
    }
  }
  if (diff <= -2) {
    return {
      id: 'ma60',
      group: 'trend',
      title: '中期位置',
      status: '运行在 60 日线之下',
      detail: `当前价较 60 日线低约 ${Math.abs(diff).toFixed(1)}%，中期趋势偏弱。`,
      tone: 'bearish',
    }
  }
  return {
    id: 'ma60',
    group: 'trend',
    title: '中期位置',
    status: '贴近 60 日线',
    detail: '价格围绕 60 日线附近波动，方向有待选择。',
    tone: 'neutral',
  }
}

function stripMa20Dev(price: number, row: IndicatorRow): TrendStrip {
  const ma20 = row.ma20
  if (ma20 == null || ma20 <= 0) {
    return {
      id: 'ma20_dev',
      group: 'trend',
      title: '短线偏离',
      status: '暂无法计算',
      detail: 'K 线数量不足，暂不计算相对 20 日线的偏离。',
      tone: 'muted',
    }
  }
  const dev = ((price - ma20) / ma20) * 100
  if (dev >= 8) {
    return {
      id: 'ma20_dev',
      group: 'trend',
      title: '短线偏离',
      status: '较 20 日线偏高',
      detail: `比 20 日线高约 ${dev.toFixed(1)}%，短线略偏热，注意回踩风险。`,
      tone: 'caution',
    }
  }
  if (dev <= -8) {
    return {
      id: 'ma20_dev',
      group: 'trend',
      title: '短线偏离',
      status: '较 20 日线偏低',
      detail: `比 20 日线低约 ${Math.abs(dev).toFixed(1)}%，短线超跌后或有反弹，但需确认量能配合。`,
      tone: 'caution',
    }
  }
  return {
    id: 'ma20_dev',
    group: 'trend',
    title: '短线偏离',
    status: '贴近 20 日线',
    detail: `与 20 日线偏离约 ${pctText(dev)}，属于正常波动区间。`,
    tone: 'neutral',
  }
}

function stripMomentum(closes: number[], indexCloses?: number[]): TrendStrip {
  const r1m = returnOverDays(closes, 21)
  const r3m = returnOverDays(closes, 63)
  if (r1m == null && r3m == null) {
    return {
      id: 'momentum',
      group: 'trend',
      title: '阶段涨跌',
      status: '历史较短',
      detail: '可用交易日不足，暂不计算近 1～3 个月表现。',
      tone: 'muted',
    }
  }
  let bench: string | null = null
  if (indexCloses && indexCloses.length >= 64 && r3m != null) {
    const idx3m = returnOverDays(indexCloses, 63)
    if (idx3m != null) {
      const rel = r3m - idx3m
      bench = rel >= 1
        ? `近 3 个月跑赢大盘约 ${rel.toFixed(1)} 个百分点`
        : rel <= -1
          ? `近 3 个月落后大盘约 ${Math.abs(rel).toFixed(1)} 个百分点`
          : '近 3 个月与大盘大致同步'
    }
  }
  const parts: string[] = []
  if (r1m != null) parts.push(`近 1 个月 ${pctText(r1m)}`)
  if (r3m != null) parts.push(`近 3 个月 ${pctText(r3m)}`)
  if (bench) parts.push(bench)
  const tone: TrendStripTone = (r3m ?? r1m ?? 0) >= 5 ? 'bullish' : (r3m ?? r1m ?? 0) <= -5 ? 'bearish' : 'neutral'
  return {
    id: 'momentum',
    group: 'trend',
    title: '阶段涨跌',
    status: tone === 'bullish' ? '阶段表现偏强' : tone === 'bearish' ? '阶段表现偏弱' : '阶段表现中性',
    detail: parts.join('；') + '。',
    tone,
  }
}

function classifyVolumeMove(chg: number, volRatio: number | null): { status: string; detail: string; tone: TrendStripTone } {
  const hot = volRatio != null && volRatio >= 1.35
  const cool = volRatio != null && volRatio <= 0.75
  const ratioText = volRatio != null ? `成交量约为近 5 日均量的 ${volRatio.toFixed(1)} 倍` : '量能信息有限'

  if (chg >= 1.5) {
    if (hot) {
      return {
        status: '放量上涨',
        detail: `上涨 ${chg.toFixed(1)}%，${ratioText}，上攻有资金配合。`,
        tone: 'bullish',
      }
    }
    if (cool) {
      return {
        status: '缩量上涨',
        detail: `上涨 ${chg.toFixed(1)}%，但量能偏弱，更像情绪推动，持续性待观察。`,
        tone: 'caution',
      }
    }
    return {
      status: '温和上涨',
      detail: `上涨 ${chg.toFixed(1)}%，${ratioText}，量价配合一般。`,
      tone: 'neutral',
    }
  }
  if (chg <= -1.5) {
    if (hot) {
      return {
        status: '放量下跌',
        detail: `下跌 ${Math.abs(chg).toFixed(1)}%，${ratioText}，抛压偏重。`,
        tone: 'bearish',
      }
    }
    if (cool) {
      return {
        status: '缩量下跌',
        detail: `下跌 ${Math.abs(chg).toFixed(1)}%，量能萎缩，杀跌动能不算强。`,
        tone: 'neutral',
      }
    }
    return {
      status: '温和下跌',
      detail: `下跌 ${Math.abs(chg).toFixed(1)}%，${ratioText}。`,
      tone: 'caution',
    }
  }
  if (cool) {
    return {
      status: '地量整理',
      detail: `波动不大（${pctText(chg)}），量能萎缩，方向尚不明确。`,
      tone: 'muted',
    }
  }
  return {
    status: '震荡整理',
    detail: `最近一波波动较小（${pctText(chg)}），${ratioText}。`,
    tone: 'neutral',
  }
}

function stripRecentVolumePrice(klines: StockKline[]): TrendStrip {
  const lookback = Math.min(12, klines.length)
  if (lookback < 3) {
    return {
      id: 'recent_vol',
      group: 'volume',
      title: '最近量价',
      status: '数据不足',
      detail: '交易日太少，暂无法判断最近一波涨跌的量能特征。',
      tone: 'muted',
    }
  }
  const start = klines.length - lookback
  let bestI = klines.length - 1
  let bestAbs = 0
  for (let i = start; i < klines.length; i++) {
    const chg = Math.abs(changePctAt(klines, i))
    if (chg > bestAbs) {
      bestAbs = chg
      bestI = i
    }
  }
  const chg = changePctAt(klines, bestI)
  const volRatio = volumeVsMa5(klines, bestI)
  const dateLabel = fmtDate(klines[bestI].date)
  const { status, detail, tone } = classifyVolumeMove(chg, volRatio)
  return {
    id: 'recent_vol',
    group: 'volume',
    title: '最近量价',
    status,
    detail: `${dateLabel}${detail}`,
    tone,
  }
}

function stripTodayVolume(klines: StockKline[], row: IndicatorRow): TrendStrip {
  const vr = row.volume_ratio
  const lastChg = changePctAt(klines, klines.length - 1)
  if (vr == null) {
    return {
      id: 'today_vol',
      group: 'volume',
      title: '今日量能',
      status: '暂无量比',
      detail: '缺少量比数据，可结合走势页成交量柱观察。',
      tone: 'muted',
    }
  }
  let status: string
  let tone: TrendStripTone
  if (vr >= 1.5) {
    status = lastChg >= 0 ? '明显放量' : '放量异动'
    tone = lastChg >= 0 ? 'bullish' : 'bearish'
  } else if (vr <= 0.7) {
    status = '缩量'
    tone = 'muted'
  } else {
    status = '量能正常'
    tone = 'neutral'
  }
  return {
    id: 'today_vol',
    group: 'volume',
    title: '今日量能',
    status,
    detail: `今日量比约 ${vr.toFixed(2)}（相对近一段均量），涨跌 ${pctText(lastChg)}。`,
    tone,
  }
}

function stripSharpe(closes: number[]): TrendStrip {
  const returns = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  if (returns.length < 60) {
    return {
      id: 'sharpe',
      group: 'risk',
      title: '走势性价比',
      status: '历史较短',
      detail: '不足 60 个交易日，暂不计算波动调整后的收益（夏普比率）。',
      tone: 'muted',
    }
  }
  const window = returns.slice(-Math.min(252, returns.length))
  const sharpe = sharpeRatio(window)
  let status: string
  let tone: TrendStripTone
  if (sharpe >= 1) {
    status = '较好'
    tone = 'bullish'
  } else if (sharpe >= 0.3) {
    status = '一般'
    tone = 'neutral'
  } else {
    status = '偏弱'
    tone = 'caution'
  }
  const days = window.length
  return {
    id: 'sharpe',
    group: 'risk',
    title: '走势性价比',
    status: `近 ${days} 日：${status}`,
    detail: '衡量「涨了多少」相对「波动有多大」。数值越高，说明走势越平稳向好；不代表未来一定继续涨。',
    tone,
  }
}

function stripDrawdown(closes: number[]): TrendStrip {
  if (closes.length < 30) {
    return {
      id: 'drawdown',
      group: 'risk',
      title: '回撤幅度',
      status: '历史较短',
      detail: '数据不足，暂不计算最大回撤。',
      tone: 'muted',
    }
  }
  const window = closes.slice(-Math.min(252, closes.length))
  const { maxDrawdown: dd } = maxDrawdown(window)
  const pct = Math.abs(dd * 100)
  let tone: TrendStripTone = 'neutral'
  if (pct >= 25) tone = 'caution'
  else if (pct <= 12) tone = 'bullish'
  return {
    id: 'drawdown',
    group: 'risk',
    title: '回撤幅度',
    status: pct >= 20 ? '波动偏大' : pct <= 12 ? '波动可控' : '波动中等',
    detail: `近一年左右最多曾从阶段高点回落约 ${pct.toFixed(1)}%，可用来感受持股颠簸程度。`,
    tone,
  }
}

function stripRsi(row: IndicatorRow): TrendStrip {
  const rsi = row.rsi_12
  if (rsi == null) {
    return {
      id: 'rsi',
      group: 'aux',
      title: '短线热度',
      status: '暂无法计算',
      detail: 'RSI 数据不足。',
      tone: 'muted',
    }
  }
  if (rsi >= 70) {
    return {
      id: 'rsi',
      group: 'aux',
      title: '短线热度',
      status: '偏热',
      detail: `RSI 约 ${rsi.toFixed(0)}，短线买盘较集中，注意追高风险。`,
      tone: 'caution',
    }
  }
  if (rsi <= 30) {
    return {
      id: 'rsi',
      group: 'aux',
      title: '短线热度',
      status: '偏冷',
      detail: `RSI 约 ${rsi.toFixed(0)}，短线卖压释放较多，但不等于立刻反弹。`,
      tone: 'neutral',
    }
  }
  return {
    id: 'rsi',
    group: 'aux',
    title: '短线热度',
    status: '中性',
    detail: `RSI 约 ${rsi.toFixed(0)}，处于常见波动区间。`,
    tone: 'neutral',
  }
}

function stripMacd(row: IndicatorRow, prev: IndicatorRow | undefined): TrendStrip {
  const hist = row.macd_hist
  const prevHist = prev?.macd_hist
  if (hist == null) {
    return {
      id: 'macd',
      group: 'aux',
      title: '动能方向',
      status: '暂无法计算',
      detail: 'MACD 数据不足。',
      tone: 'muted',
    }
  }
  if (hist > 0 && (prevHist == null || hist >= prevHist)) {
    return {
      id: 'macd',
      group: 'aux',
      title: '动能方向',
      status: '动能偏多',
      detail: 'MACD 柱状线在零轴上方且未明显走弱，短线动能尚可。',
      tone: 'bullish',
    }
  }
  if (hist < 0 && (prevHist == null || hist <= prevHist)) {
    return {
      id: 'macd',
      group: 'aux',
      title: '动能方向',
      status: '动能偏弱',
      detail: 'MACD 柱状线在零轴下方，短线动能不足。',
      tone: 'bearish',
    }
  }
  return {
    id: 'macd',
    group: 'aux',
    title: '动能方向',
    status: '动能反复',
    detail: 'MACD 柱状线来回穿越零轴附近，方向不够清晰。',
    tone: 'neutral',
  }
}

function stripHolding(price: number, cost: number): TrendStrip {
  const pnl = ((price - cost) / cost) * 100
  const tone: TrendStripTone = pnl >= 5 ? 'bullish' : pnl <= -5 ? 'bearish' : 'neutral'
  return {
    id: 'holding',
    group: 'holding',
    title: '相对成本',
    status: pnl >= 0 ? `浮盈 ${pnl.toFixed(1)}%` : `浮亏 ${Math.abs(pnl).toFixed(1)}%`,
    detail: `现价 ${price.toFixed(2)}，成本 ${cost.toFixed(2)}。可结合上方趋势与量价纸条判断继续持有或减仓。`,
    tone,
  }
}

export function buildTrendBrief(input: TrendBriefInput): TrendBriefData {
  const klines = [...input.klines].sort((a, b) => a.date.localeCompare(b.date))
  const last = klines[klines.length - 1]
  const price = input.livePrice != null && input.livePrice > 0 ? input.livePrice : last.close
  const indicators = computeAll(klines)
  const row = indicators[indicators.length - 1]
  const prev = indicators.length > 1 ? indicators[indicators.length - 2] : undefined
  const closes = klines.map(k => k.close)
  const indexCloses = input.indexKlines?.map(k => k.close)

  const strips: TrendStrip[] = [
    stripMaStructure(price, row),
    stripMa60(price, row),
    stripMa20Dev(price, row),
    stripMomentum(closes, indexCloses),
    stripRecentVolumePrice(klines),
    stripTodayVolume(klines, row),
    stripSharpe(closes),
    stripDrawdown(closes),
    stripRsi(row),
    stripMacd(row, prev),
  ]

  if (input.holdingCost != null && input.holdingCost > 0) {
    strips.push(stripHolding(price, input.holdingCost))
  }

  strips.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))

  return {
    code: input.code,
    name: input.name,
    as_of: last.date,
    data_days: klines.length,
    strips,
  }
}

export function groupTrendStrips(strips: TrendStrip[]): { group: TrendStrip['group']; label: string; items: TrendStrip[] }[] {
  const map = new Map<TrendStrip['group'], TrendStrip[]>()
  for (const s of strips) {
    const list = map.get(s.group) ?? []
    list.push(s)
    map.set(s.group, list)
  }
  return GROUP_ORDER
    .filter(g => map.has(g))
    .map(g => ({ group: g, label: TREND_GROUP_LABELS[g], items: map.get(g)! }))
}
