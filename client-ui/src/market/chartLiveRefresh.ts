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
