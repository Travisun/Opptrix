import type { ColorScheme } from '../theme/tokens'
import { getOpptrixTokens } from '../theme/tokens'

export const MARKET_UP = '#FF3B30'
export const MARKET_DOWN = '#34C759'

export function getChartLayout(scheme: ColorScheme) {
  const t = getOpptrixTokens(scheme)
  return {
    background: { type: 'solid' as const, color: t.canvas },
    textColor: t.textTertiary,
    fontSize: 10,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    attributionLogo: false,
  }
}

export function getChartGrid(scheme: ColorScheme) {
  const t = getOpptrixTokens(scheme)
  return {
    vertLines: { color: t.separator },
    horzLines: { color: t.separator },
  }
}

/** @deprecated Use getChartLayout(resolvedScheme) */
export const chartLayout = getChartLayout('light')

/** @deprecated Use getChartGrid(resolvedScheme) */
export const chartGrid = getChartGrid('light')

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
  ma5: '#F5F5F7',
  ma10: '#FF9500',
  ma20: '#5856D6',
  ma60: '#32ADE6',
}

export const maColorsLight = {
  ma5: '#1D1D1F',
  ma10: '#FF9500',
  ma20: '#5856D6',
  ma60: '#32ADE6',
}

export function getMaColors(scheme: ColorScheme) {
  return scheme === 'dark' ? maColors : maColorsLight
}

export const indicatorColors = {
  macd: '#5856D6',
  signal: '#FF9500',
  rsi: '#32ADE6',
  avg: '#FF9500',
}

export function getChartTheme(scheme: ColorScheme) {
  return {
    layout: getChartLayout(scheme),
    grid: getChartGrid(scheme),
    crosshair: {
      vertLine: {
        width: 1 as const,
        color: scheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(60,60,67,0.16)',
      },
      horzLine: {
        width: 1 as const,
        color: scheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(60,60,67,0.16)',
      },
    },
    maColors: getMaColors(scheme),
  }
}
