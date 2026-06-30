import type { ChartPeriod } from '../types/market'
import { isIntradayPeriod, isMinuteOhlcPeriod } from './chartTime'

/** Periods that receive live polling on trading days. */
export function isLiveChartPeriod(period: ChartPeriod): boolean {
  return isIntradayPeriod(period) || isMinuteOhlcPeriod(period)
}

export function cnMarketNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
}

export function isCnTradingWeekday(now = cnMarketNow()): boolean {
  const day = now.getDay()
  return day >= 1 && day <= 5
}

/** A-share session + call auction (Beijing). */
export function isCnMarketOpen(now = cnMarketNow()): boolean {
  if (!isCnTradingWeekday(now)) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return (mins >= 9 * 60 + 15 && mins <= 11 * 60 + 30)
    || (mins >= 13 * 60 && mins <= 15 * 60 + 5)
}

export function cnTodayString(now = cnMarketNow()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isCnBeforeMarketOpen(now = cnMarketNow()): boolean {
  if (!isCnTradingWeekday(now)) return true
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins < 9 * 60 + 15
}

export function isCnAfterMarketClose(now = cnMarketNow()): boolean {
  if (!isCnTradingWeekday(now)) return true
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins > 15 * 60 + 5
}

/** Weekday and session has started (incl. lunch break and after close). */
export function isCnTradingSessionDay(now = cnMarketNow()): boolean {
  return isCnTradingWeekday(now) && !isCnBeforeMarketOpen(now)
}

/**
 * 行业/列表是否应拉实时行情覆盖本地库：
 * - 非交易日、开盘前：用本地已收盘数据
 * - 盘中、午休、收盘后且库未更新到今天：用实时
 */
export function shouldUseLiveIndustryQuotes(storedQuoteDate: string | null | undefined, now = cnMarketNow()): boolean {
  if (!isCnTradingSessionDay(now)) return false
  if (isCnMarketOpen(now)) return true
  if (!isCnAfterMarketClose(now)) return true
  const today = cnTodayString(now)
  if (!storedQuoteDate || storedQuoteDate < today) return true
  return false
}

export const INDUSTRY_STATS_POLL_MS = 5 * 60_000
export const INDUSTRY_QUOTES_POLL_MS = 60_000
export const TREND_BRIEF_POLL_MS = 60_000

/** 趋势研判仅在 A 股盘中轮询；非交易日、盘前盘后数据已固定，进入页面加载一次即可。 */
export function shouldPollTrendBrief(now = cnMarketNow()): boolean {
  return isCnMarketOpen(now)
}

export function shouldPollChartLive(
  period: ChartPeriod,
  active: boolean,
  isTradingDay?: boolean | null,
): boolean {
  if (!active) return false
  if (!isLiveChartPeriod(period)) return false
  if (isTradingDay === false) return false
  if (!isCnTradingWeekday()) return false
  return isCnMarketOpen()
}

export function chartLivePollIntervalMs(period: ChartPeriod): number {
  switch (period) {
    case 'intraday': return 15_000
    case '1m': return 30_000
    case '5m': return 60_000
    case '15m': return 90_000
    case '30m': return 120_000
    case '60m': return 180_000
    default: return 60_000
  }
}
