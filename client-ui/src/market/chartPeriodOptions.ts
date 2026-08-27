import type { ChartPeriod } from '../types/market'
import type { InstrumentRef } from '../types/instrument'
import { hasApplicationCapability } from './capabilities'

export interface ChartPeriodOption {
  id: ChartPeriod
  label: string
}

/** 券商 APP 标准周期顺序：日 → 周 → 月 → 季 → 年 */
const BROKER_KLINE_OPTIONS: ChartPeriodOption[] = [
  { id: 'daily', label: '日K' },
  { id: 'weekly', label: '周K' },
  { id: 'monthly', label: '月K' },
  { id: 'quarterly', label: '季K' },
  { id: 'yearly', label: '年K' },
]

const BASIC_OHLC_OPTIONS: ChartPeriodOption[] = [
  { id: 'daily', label: '日K' },
  { id: 'weekly', label: '周K' },
  { id: 'monthly', label: '月K' },
]

function cnExtendedOhlc(ref: InstrumentRef, cnEquityChart: boolean): boolean {
  if (!cnEquityChart) return false
  return ref.assetClass === 'EQUITY' || ref.assetClass === 'INDEX'
}

/** 指数图：仅日/周/月/季/年 K，不提供分时 */
export function buildIndexChartPeriodOptions(_ref: InstrumentRef): ChartPeriodOption[] {
  return BROKER_KLINE_OPTIONS
}

export function buildChartPeriodOptions(
  ref: InstrumentRef,
  opts: { cnEquityChart: boolean; crossMarketChart: boolean },
): ChartPeriodOption[] {
  if (!hasApplicationCapability(ref, 'chart_daily')) {
    return BASIC_OHLC_OPTIONS
  }

  const extendedOhlc = opts.crossMarketChart || cnExtendedOhlc(ref, opts.cnEquityChart)
  return extendedOhlc ? BROKER_KLINE_OPTIONS : BASIC_OHLC_OPTIONS
}

export const CN_STOCK_CHART_PERIODS: ReadonlySet<ChartPeriod> = new Set([
  'daily', 'weekly', 'monthly', 'quarterly', 'yearly',
])
