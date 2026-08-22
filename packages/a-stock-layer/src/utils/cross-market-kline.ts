/**
 * 跨市场图表周期 → Engine / TickFlow 查询参数。
 */

export type CrossMarketKlineEngineQuery = {
  enginePeriod: string
  count: number
  intradayLine: boolean
}

const INTRADAY_MINUTE_BARS = 400
const FIVEDAY_MINUTE_BARS = 2000

export function crossMarketFiveDayMinuteCount(count: number): number {
  return Math.max(count, FIVEDAY_MINUTE_BARS)
}

export function crossMarketIntradayMinuteCount(count: number): number {
  return Math.max(count, INTRADAY_MINUTE_BARS)
}

export function resolveCrossMarketKlineEngineQuery(
  uiPeriod: string,
  count: number,
): CrossMarketKlineEngineQuery {
  const p = uiPeriod.trim().toLowerCase()
  switch (p) {
    case 'intraday':
      return {
        enginePeriod: 'intraday',
        count: crossMarketIntradayMinuteCount(count),
        intradayLine: true,
      }
    case '5day':
    case 'fdays':
    case 'five':
      return {
        enginePeriod: '5day',
        count: crossMarketFiveDayMinuteCount(count),
        intradayLine: true,
      }
    default:
      return {
        enginePeriod: uiPeriod,
        count,
        intradayLine: false,
      }
  }
}
