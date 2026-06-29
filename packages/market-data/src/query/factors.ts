import { SCREEN_PACK_FACTORS } from '../sync/config.js'

export const SCREEN_FACTOR_LABELS: Record<string, string> = {
  pe: '市盈率 PE',
  pb: '市净率 PB',
  roe: 'ROE',
  debt_ratio: '资产负债率',
  gross_margin: '毛利率',
  net_profit_yoy: '净利润同比',
  profit_cagr_3y: '净利润3年CAGR',
  roe_trend: 'ROE趋势',
  peg: 'PEG',
  momentum_1m: '1月动量',
  momentum_3m: '3月动量',
  momentum_6m: '6月动量',
  volume_ratio: '量比',
}

export function listScreenFactors() {
  return SCREEN_PACK_FACTORS.map(name => ({
    name,
    label: SCREEN_FACTOR_LABELS[name] ?? name,
  }))
}
