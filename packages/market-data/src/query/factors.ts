import { SCREEN_PACK_FACTORS } from '../sync/config.js'

export const SCREEN_FACTOR_LABELS: Record<string, string> = {
  momentum_1m: '1月动量',
  momentum_3m: '3月动量',
  momentum_6m: '6月动量',
  volume_ratio: '量比',
  volatility_20d: '20日波动率',
  drawdown_60d: '60日回撤',
}

export function listScreenFactors() {
  return SCREEN_PACK_FACTORS.map(name => ({
    name,
    label: SCREEN_FACTOR_LABELS[name] ?? name,
  }))
}
