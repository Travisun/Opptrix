import { ColorType } from 'lightweight-charts'
import type { ColorScheme } from '../theme/tokens'
import { getOpptrixTokens } from '../theme/tokens'
import { resolveSansFontFamily } from '../theme/fontFamily'

export const MARKET_UP = '#FF3B30'
export const MARKET_DOWN = '#34C759'

export type IndexMountainColors = {
  lineColor: string
  topColor: string
  bottomColor: string
  /** 最新价水平锚线 */
  anchorLineColor: string
  /** 最新点外圈光晕 */
  glowColor: string
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getChartLayout(scheme: ColorScheme) {
  const t = getOpptrixTokens(scheme)
  return {
    background: { type: ColorType.Solid, color: t.canvas },
    textColor: t.textTertiary,
    fontSize: 10,
    fontFamily: resolveSansFontFamily(),
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

export function getIndexMountainColors(
  scheme: ColorScheme,
  trend: 'up' | 'down' | 'flat' = 'flat',
): IndexMountainColors {
  if (trend === 'up') {
    return {
      lineColor: MARKET_UP,
      topColor: scheme === 'dark' ? 'rgba(255, 59, 48, 0.42)' : 'rgba(255, 59, 48, 0.32)',
      bottomColor: 'rgba(255, 59, 48, 0.02)',
      anchorLineColor: scheme === 'dark' ? 'rgba(255, 59, 48, 0.62)' : 'rgba(255, 59, 48, 0.48)',
      glowColor: hexToRgba(MARKET_UP, scheme === 'dark' ? 0.38 : 0.28),
    }
  }
  if (trend === 'down') {
    return {
      lineColor: MARKET_DOWN,
      topColor: scheme === 'dark' ? 'rgba(52, 199, 89, 0.42)' : 'rgba(52, 199, 89, 0.32)',
      bottomColor: 'rgba(52, 199, 89, 0.02)',
      anchorLineColor: scheme === 'dark' ? 'rgba(52, 199, 89, 0.62)' : 'rgba(52, 199, 89, 0.48)',
      glowColor: hexToRgba(MARKET_DOWN, scheme === 'dark' ? 0.38 : 0.28),
    }
  }
  const lineColor = '#5856D6'
  return {
    lineColor,
    topColor: scheme === 'dark' ? 'rgba(88, 86, 214, 0.38)' : 'rgba(88, 86, 214, 0.28)',
    bottomColor: 'rgba(88, 86, 214, 0.02)',
    anchorLineColor: scheme === 'dark' ? 'rgba(88, 86, 214, 0.58)' : 'rgba(88, 86, 214, 0.44)',
    glowColor: hexToRgba(lineColor, scheme === 'dark' ? 0.36 : 0.26),
  }
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
