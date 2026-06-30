import { opptrixTokens } from '../theme/tokens'

export const MARKET_UP = '#FF3B30'
export const MARKET_DOWN = '#34C759'

export const chartLayout = {
  background: { type: 'solid' as const, color: opptrixTokens.canvas },
  textColor: opptrixTokens.textTertiary,
  fontSize: 10,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  attributionLogo: false,
}

export const chartGrid = {
  vertLines: { color: 'rgba(60, 60, 67, 0.06)' },
  horzLines: { color: 'rgba(60, 60, 67, 0.06)' },
}

export const candlestickColors = {
  upColor: MARKET_UP,
  downColor: MARKET_DOWN,
  borderUpColor: MARKET_UP,
  borderDownColor: MARKET_DOWN,
  wickUpColor: MARKET_UP,
  wickDownColor: MARKET_DOWN,
}

/** A 股分钟 K 需 0.01 最小价位，否则高价股 K 线会被压成横线 */
export const stockPriceFormat = {
  type: 'price' as const,
  precision: 2,
  minMove: 0.01,
}

export const maColors = {
  ma5: '#1D1D1F',
  ma10: '#FF9500',
  ma20: '#5856D6',
  ma60: '#32ADE6',
}

export const indicatorColors = {
  macd: '#5856D6',
  signal: '#FF9500',
  rsi: '#32ADE6',
  avg: '#FF9500',
}
