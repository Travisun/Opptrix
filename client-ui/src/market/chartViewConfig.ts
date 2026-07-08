import type { ChartPeriod } from '../types/market'

export const MAX_CHART_BARS = 800
export const LOAD_MORE_STEP = 200
export const HISTORY_EDGE_THRESHOLD = 15

/** 分钟 K 可加载上限（TDX 单次最多 800，靠 offset 分页叠加） */
export function maxChartBars(period: ChartPeriod): number {
  switch (period) {
    case '1m': return 2400
    case '5m': return 1600
    case '15m': return 1200
    case '30m':
    case '60m': return 800
    case 'year5': return 1300
    case 'year3': return 780
    case 'year1': return 260
    default: return MAX_CHART_BARS
  }
}

export function initialFetchCount(period: ChartPeriod): number {
  switch (period) {
    case 'intraday': return 240
    case '1m': return 480
    case '5m': return 480
    case '15m': return 320
    case '30m': return 240
    case '60m': return 240
    case '5day': return 120
    case 'weekly': return 160
    case 'monthly': return 80
    case 'year1': return 260
    case 'year3': return 780
    case 'year5': return 1300
    default: return 320
  }
}

/** Default visible bar count — focus on the most recent segment. */
export function defaultVisibleBars(period: ChartPeriod): number {
  switch (period) {
    case 'intraday': return 120
    case '1m': return 90
    case '5m': return 72
    case '15m': return 64
    case '30m': return 48
    case '60m': return 48
    case '5day': return 48
    case 'weekly': return 52
    case 'monthly': return 24
    case 'year1': return 120
    case 'year3': return 180
    case 'year5': return 240
    default: return 60
  }
}
