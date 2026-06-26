import { BaseStrategy, mkSignal, type Signal, type StrategyData } from './base.js'
import { lastRow } from './indicators.js'

class TrendStrategy extends BaseStrategy {
  readonly name = 'trend'
  readonly displayName = '趋势跟踪'
  readonly source = 'Goldman Sachs GAT'
  readonly weight = 0.25

  analyze(data: StrategyData): Signal[] {
    const signals: Signal[] = []
    const last = lastRow(data.indicators ?? [])
    const price = data.price
    if (!last || price == null) return signals

    const { ma5, ma10, ma20, ma60, ma_width: mw } = last
    if (ma5 != null && ma10 != null && ma20 != null) {
      if (ma5 > ma10 && ma10 > ma20) {
        signals.push(mkSignal('Trend_BullAlign', 'BUY', 0.4, this.source, '多头排列'))
      } else if (ma5 < ma10 && ma10 < ma20) {
        signals.push(mkSignal('Trend_BearAlign', 'SELL', 0.4, this.source, '空头排列'))
      }
    }
    if (ma60 != null) {
      signals.push(price > ma60
        ? mkSignal('Trend_AboveMA60', 'BUY', 0.25, this.source, '价在MA60上')
        : mkSignal('Trend_BelowMA60', 'SELL', 0.25, this.source, '价在MA60下'))
    }
    if (mw != null && Math.abs(mw) > 5) {
      signals.push(mw > 0
        ? mkSignal('Trend_MAExpand', 'BUY', 0.15, this.source, `均线发散${mw.toFixed(1)}%`)
        : mkSignal('Trend_MAContract', 'SELL', 0.15, this.source, `均线发散${mw.toFixed(1)}%`))
    }
    return signals
  }
}

class MeanReversionStrategy extends BaseStrategy {
  readonly name = 'mean_reversion'
  readonly displayName = '均值回归'
  readonly source = 'JP Morgan Technical'
  readonly weight = 0.25

  analyze(data: StrategyData): Signal[] {
    const signals: Signal[] = []
    const last = lastRow(data.indicators ?? [])
    const price = data.price
    if (!last || price == null) return signals

    const { boll_low: bl, boll_up: bu, rsi_6: r6, boll_b: bb, williams_r: wr } = last
    if (bl != null && r6 != null && price <= bl * 1.01 && r6 < 35) {
      signals.push(mkSignal('Bollinger_Oversold', 'BUY', 0.5, this.source, `Boll下轨+RSI${r6.toFixed(0)}`))
    }
    if (bu != null && r6 != null && price >= bu * 0.99 && r6 > 65) {
      signals.push(mkSignal('Bollinger_Overbought', 'SELL', 0.5, this.source, `Boll上轨+RSI${r6.toFixed(0)}`))
    }
    if (bb != null && bb < 0) signals.push(mkSignal('Boll_B_Below', 'BUY', 0.4, this.source, '%B超卖'))
    if (bb != null && bb > 100) signals.push(mkSignal('Boll_B_Above', 'SELL', 0.4, this.source, '%B超买'))
    if (wr != null && wr < -80) signals.push(mkSignal('Williams_Sold', 'BUY', 0.45, this.source, 'Williams超卖'))
    if (wr != null && wr > -20) signals.push(mkSignal('Williams_Bought', 'SELL', 0.45, this.source, 'Williams超买'))
    return signals
  }
}

class MomentumFlowStrategy extends BaseStrategy {
  readonly name = 'momentum_flow'
  readonly displayName = '动量资金流'
  readonly source = 'Morgan Stanley Quant'
  readonly weight = 0.20

  analyze(data: StrategyData): Signal[] {
    const signals: Signal[] = []
    const rows = data.indicators ?? []
    const last = lastRow(rows)
    const prev = rows.length >= 2 ? rows[rows.length - 2] : null
    if (!last) return signals

    const { macd, macd_signal: sig, macd_hist: hist, kdj_k: k, kdj_d: d, kdj_j: j } = last
    if (macd != null && sig != null && hist != null) {
      if (macd > sig && hist > 0 && prev && (prev.macd ?? 0) < (prev.macd_signal ?? 0)) {
        signals.push(mkSignal('MACD_GoldenCross', 'BUY', 0.65, this.source, 'MACD金叉'))
      } else if (macd < sig && hist < 0 && prev && (prev.macd ?? 0) > (prev.macd_signal ?? 0)) {
        signals.push(mkSignal('MACD_DeathCross', 'SELL', 0.65, this.source, 'MACD死叉'))
      }
    }
    if (k != null && d != null && j != null) {
      if (j < 0 && k < 20) signals.push(mkSignal('KDJ_Oversold', 'BUY', 0.5, this.source, `KDJ超卖 J=${j.toFixed(0)}`))
      if (j > 100 && k > 80) signals.push(mkSignal('KDJ_Overbought', 'SELL', 0.5, this.source, `KDJ超买 J=${j.toFixed(0)}`))
    }
    const mf = data.moneyFlow?.[0] as { mainNet?: number } | undefined
    if (mf?.mainNet != null) {
      if (mf.mainNet > 0) signals.push(mkSignal('MainFlow_In', 'BUY', 0.35, this.source, '主力净流入'))
      else if (mf.mainNet < 0) signals.push(mkSignal('MainFlow_Out', 'SELL', 0.35, this.source, '主力净流出'))
    }
    return signals
  }
}

class VolumePriceStrategy extends BaseStrategy {
  readonly name = 'volume_price'
  readonly displayName = '量价关系'
  readonly source = 'Morgan Stanley Quant'
  readonly weight = 0.15

  analyze(data: StrategyData): Signal[] {
    const signals: Signal[] = []
    const last = lastRow(data.indicators ?? [])
    const chg = data.changePct ?? 0
    const vr = data.volumeRatio ?? last?.volume_ratio ?? 1
    if (!last || data.price == null) return signals

    if (vr > 1.8) {
      if (chg > 2) signals.push(mkSignal('Vol_Breakout', 'BUY', Math.min(1, vr / 3), this.source, `放量上涨 量比${vr.toFixed(1)}`))
      else if (chg < -2) signals.push(mkSignal('Vol_Dump', 'SELL', Math.min(1, vr / 3), this.source, `放量下跌 量比${vr.toFixed(1)}`))
    } else if (vr < 0.5 && chg < 0) {
      signals.push(mkSignal('Vol_ThinDown', 'BUY', 0.35, this.source, '缩量下跌'))
    }
    const { volume_ma5: v5, volume_ma10: v10, obv } = last
    if (v5 != null && v10 != null && v5 > v10 * 1.1 && chg > 0) {
      signals.push(mkSignal('Vol_MA_Bullish', 'BUY', 0.25, this.source, '量能MA多头'))
    }
    if (obv != null && chg > 0 && v5 != null && v10 != null && v5 < v10) {
      signals.push(mkSignal('OBV_Divergence', 'SELL', 0.45, this.source, '量价背离'))
    }
    return signals
  }
}

class MarketContextStrategy extends BaseStrategy {
  readonly name = 'market_context'
  readonly displayName = '市场背景'
  readonly source = 'Bridgewater'
  readonly weight = 0.15

  analyze(data: StrategyData): Signal[] {
    const signals: Signal[] = []
    const smf = data.sectorMoneyFlow
    const mb = data.marketBreadth
    if (smf) {
      const mp = Number(smf.mainNetPct ?? smf.main_net_pct ?? 0)
      if (mp > 5) signals.push(mkSignal('Sector_Money_In', 'BUY', Math.min(1, mp / 15), this.source, '行业资金流入'))
      else if (mp < -5) signals.push(mkSignal('Sector_Money_Out', 'SELL', Math.min(1, Math.abs(mp) / 15), this.source, '行业资金流出'))
    }
    if (mb) {
      const ap = Number(mb.advancePct ?? mb.advance_pct ?? 50)
      if (ap > 65) signals.push(mkSignal('Market_Hot', 'BUY', Math.min(1, (ap - 50) / 25), this.source, `上涨占比${ap.toFixed(0)}%`))
      else if (ap < 35) signals.push(mkSignal('Market_Cold', 'HOLD', 0.3, this.source, `上涨占比${ap.toFixed(0)}%`))
    }
    return signals
  }
}

class BehavioralStrategy extends BaseStrategy {
  readonly name = 'behavioral'
  readonly displayName = '行为金融'
  readonly source = 'Behavioral Finance'
  readonly weight = 0.10

  analyze(data: StrategyData): Signal[] {
    const last = lastRow(data.indicators ?? [])
    if (!last) return []
    const r6 = last.rsi_6
    if (r6 == null) return []
    if (r6 > 80) return [mkSignal('Overconfidence', 'SELL', 0.55, this.source, 'RSI极度超买')]
    if (r6 < 20) return [mkSignal('Panic_Selling', 'BUY', 0.55, this.source, 'RSI极度超卖')]
    return [mkSignal('Neutral', 'HOLD', 0.2, this.source, '情绪中性')]
  }
}

class AnomalyStrategy extends BaseStrategy {
  readonly name = 'anomaly'
  readonly displayName = '异象事件'
  readonly source = 'Market Anomalies'
  readonly weight = 0.10

  analyze(data: StrategyData): Signal[] {
    const chg = data.changePct ?? 0
    const tr = data.turnoverRate ?? 0
    if (Math.abs(chg) > 7 && tr > 10) {
      return [mkSignal('Extreme_Move', chg > 0 ? 'SELL' : 'BUY', 0.5, this.source, '极端波动+高换手')]
    }
    if (chg > 5 && tr < 3) {
      return [mkSignal('LowVol_Surge', 'BUY', 0.4, this.source, '低换手大涨')]
    }
    return []
  }
}

class ValueFactorStrategy extends BaseStrategy {
  readonly name = 'value_factor'
  readonly displayName = '价值因子'
  readonly source = 'Fama-French'
  readonly weight = 0.10

  analyze(_data: StrategyData): Signal[] {
    return [mkSignal('Value_Neutral', 'HOLD', 0.3, this.source, '需结合估值因子')]
  }
}

class RotationStrategy extends BaseStrategy {
  readonly name = 'rotation'
  readonly displayName = '行业轮动'
  readonly source = 'Sector Rotation'
  readonly weight = 0.10

  analyze(data: StrategyData): Signal[] {
    const smf = data.sectorMoneyFlow
    if (!smf) return []
    const mp = Number(smf.mainNetPct ?? smf.main_net_pct ?? 0)
    if (mp > 3) return [mkSignal('Sector_Rotate_In', 'BUY', 0.45, this.source, `${data.industry ?? '行业'}资金偏强`)]
    if (mp < -3) return [mkSignal('Sector_Rotate_Out', 'SELL', 0.45, this.source, `${data.industry ?? '行业'}资金偏弱`)]
    return []
  }
}

export const STRATEGY_REGISTRY: Record<string, BaseStrategy> = {
  trend: new TrendStrategy(),
  mean_reversion: new MeanReversionStrategy(),
  momentum_flow: new MomentumFlowStrategy(),
  volume_price: new VolumePriceStrategy(),
  market_context: new MarketContextStrategy(),
  behavioral: new BehavioralStrategy(),
  anomaly: new AnomalyStrategy(),
  value_factor: new ValueFactorStrategy(),
  rotation: new RotationStrategy(),
}

export const STRATEGY_LABELS: Record<string, string> = {
  trend: '趋势跟踪',
  mean_reversion: '均值回归',
  momentum_flow: '动量资金流',
  volume_price: '量价关系',
  market_context: '市场背景',
  behavioral: '行为金融',
  anomaly: '异象事件',
  value_factor: '价值因子',
  rotation: '行业轮动',
}

export function listStrategies() {
  return Object.entries(STRATEGY_REGISTRY).map(([name, s]) => ({
    name, displayName: s.displayName, source: s.source, weight: s.weight,
  }))
}

export function fuseSignals(signals: Signal[]) {
  let score = 0
  let active = 0
  const reasons: string[] = []
  for (const s of signals) {
    if (s.direction === 'BUY') { score += s.strength; active++ }
    else if (s.direction === 'SELL') { score -= s.strength; active++ }
    if (s.reason) reasons.push(s.reason)
  }
  const confidence = active ? Math.min(1, Math.abs(score) / active) : 0
  const verdict = score > 0.15 ? 'BUY' as const : score < -0.15 ? 'SELL' as const : 'HOLD' as const
  return { score: score * 100, verdict, confidence, reasons: reasons.slice(0, 8) }
}

export function dominantDirection(signals: Signal[]): '看多' | '看空' | '中性' {
  const buy = signals.filter(s => s.direction === 'BUY').length
  const sell = signals.filter(s => s.direction === 'SELL').length
  if (buy > sell) return '看多'
  if (sell > buy) return '看空'
  return '中性'
}
