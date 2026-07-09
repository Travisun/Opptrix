import type { ChartPeriod, IntradayChartBar, OhlcChartBar, StockChartData } from '../types/market'
import { compareChartTime, isIntradayPeriod, isMinuteOhlcPeriod, chartTimeForPeriod } from './chartTime'
import { MARKET_DOWN, MARKET_UP, getMaColors } from './chartTheme'
import type { ColorScheme } from '../theme/tokens'
import { getOpptrixTokens } from '../theme/tokens'
import { CN_TIMEZONE } from '../utils/cnTime'
import type { Time } from 'lightweight-charts'

export type ChartMode = 'ohlc' | 'intraday'

export interface LinePoint {
  time: Time
  value: number
}

export interface CandlePoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
}

export interface VolumePoint {
  time: Time
  value: number
  color: string
}

export interface MacdPoint {
  time: Time
  hist: number
  histColor: string
  dif: number
  dea: number
}

export interface ChartSeriesBundle {
  mode: ChartMode
  showMacd: boolean
  preClose?: number | null
  candles: CandlePoint[]
  priceLine: LinePoint[]
  avgLine: LinePoint[]
  maLines: { key: string; color: string; points: LinePoint[] }[]
  volume: VolumePoint[]
  macd: MacdPoint[]
  cyqOverlay?: {
    avgCost: number
    cost90Low: number
    cost90High: number
    cost70Low: number
    cost70High: number
  } | null
}

function volumeColor(change: number | null | undefined, scheme: ColorScheme): string {
  if (change == null || change === 0) return getOpptrixTokens(scheme).textTertiary
  return change >= 0 ? MARKET_UP : MARKET_DOWN
}

function timeKey(time: Time): string {
  return typeof time === 'number' ? String(time) : time
}

function dedupeByTime<T extends { time: Time }>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of rows) map.set(timeKey(row.time), row)
  return [...map.values()].sort((a, b) => compareChartTime(a.time, b.time))
}

function assertUniqueTimes(times: Time[], label: string, period: string): void {
  const unique = new Set(times.map(timeKey))
  if (unique.size === times.length || times.length === 0) return
  if (isMinuteOhlcPeriod(period)) {
    throw new Error(`${label} 时间轴异常（${times.length} 条/${unique.size} 个时间点），分钟 K 线数据不完整`)
  }
}

function chartTime(raw: string, period: string, timeZone?: string): Time {
  return chartTimeForPeriod(raw, period, timeZone)
}

function normalizeOhlc(bar: OhlcChartBar, period: string, timeZone?: string): CandlePoint {
  let open = Number(bar.open)
  let high = Number(bar.high)
  let low = Number(bar.low)
  let close = Number(bar.close)
  if (!Number.isFinite(open)) open = close
  if (!Number.isFinite(close)) close = open
  if (!Number.isFinite(high)) high = Math.max(open, close)
  if (!Number.isFinite(low)) low = Math.min(open, close)
  high = Math.max(open, high, low, close)
  low = Math.min(open, high, low, close)
  return {
    time: chartTime(bar.time, period, timeZone),
    open,
    high,
    low,
    close,
  }
}

function maPoints(
  indicators: StockChartData['indicators'],
  key: 'ma5' | 'ma10' | 'ma20' | 'ma60',
  period: string,
  timeZone?: string,
): LinePoint[] {
  return dedupeByTime(
    indicators
      .filter(row => row[key] != null)
      .map(row => ({ time: chartTime(row.time, period, timeZone), value: row[key]! })),
  )
}

function isLineChartPeriod(period: string, bars: StockChartData['bars']): boolean {
  if (isIntradayPeriod(period)) return true
  if (period === '5day' && bars.length > 0 && 'avgPrice' in bars[0]!) return true
  return false
}

/** Normalize API payload → chart-ready series (sorted, deduped, validated). */
export function buildChartSeries(data: StockChartData, scheme: ColorScheme = 'light'): ChartSeriesBundle {
  const intraday = isLineChartPeriod(data.period, data.bars)
  const minuteOhlc = isMinuteOhlcPeriod(data.period)
  const showMacd = !intraday && !minuteOhlc && data.indicators.some(row => row.macd != null)
  const ma = getMaColors(scheme)
  const tz = data.chartTimeZone ?? CN_TIMEZONE

  if (intraday) {
    const bars = data.bars as IntradayChartBar[]
    const priceLine = dedupeByTime(bars.map(bar => ({
      time: chartTime(bar.time, data.period, tz),
      value: bar.price,
    })))
    const avgLine = dedupeByTime(bars.map(bar => ({
      time: chartTime(bar.time, data.period, tz),
      value: bar.avgPrice,
    })))
    const volume = dedupeByTime(bars.map((bar, i) => {
      const ref = i > 0 ? bars[i - 1].price : data.preClose
      const delta = ref == null ? null : bar.price - ref
      return {
        time: chartTime(bar.time, data.period, tz),
        value: bar.volume,
        color: volumeColor(delta, scheme),
      }
    }))

    assertUniqueTimes(priceLine.map(p => p.time), '分时', data.period)

    return {
      mode: 'intraday',
      showMacd: false,
      preClose: data.preClose,
      candles: [],
      priceLine,
      avgLine,
      volume,
      maLines: [],
      macd: [],
      cyqOverlay: null,
    }
  }

  const bars = data.bars as OhlcChartBar[]
  const candles = dedupeByTime(bars.map(bar => normalizeOhlc(bar, data.period, tz)))
  const volume = dedupeByTime(bars.map(bar => ({
    time: chartTime(bar.time, data.period, tz),
    value: bar.volume,
    color: volumeColor(bar.changePct, scheme),
  })))
  const macd = dedupeByTime(
    data.indicators
      .filter(row => row.macdHist != null && row.macd != null && row.macdSignal != null)
      .map(row => ({
        time: chartTime(row.time, data.period, tz),
        hist: row.macdHist!,
        histColor: row.macdHist! >= 0 ? MARKET_UP : MARKET_DOWN,
        dif: row.macd!,
        dea: row.macdSignal!,
      })),
  )

  assertUniqueTimes(candles.map(c => c.time), periodLabel(data.period), data.period)

  const latest = data.cyqLatest
  const cyqOverlay = latest ? {
    avgCost: latest.avgCost,
    cost90Low: latest.cost90Low,
    cost90High: latest.cost90High,
    cost70Low: latest.cost70Low,
    cost70High: latest.cost70High,
  } : null

  return {
    mode: 'ohlc',
    showMacd,
    candles,
    priceLine: [],
    avgLine: [],
    maLines: minuteOhlc
      ? [
          { key: 'ma5', color: ma.ma5, points: maPoints(data.indicators, 'ma5', data.period, tz) },
          { key: 'ma10', color: ma.ma10, points: maPoints(data.indicators, 'ma10', data.period, tz) },
        ].filter(row => row.points.length > 0)
      : [
          { key: 'ma5', color: ma.ma5, points: maPoints(data.indicators, 'ma5', data.period, tz) },
          { key: 'ma10', color: ma.ma10, points: maPoints(data.indicators, 'ma10', data.period, tz) },
          { key: 'ma20', color: ma.ma20, points: maPoints(data.indicators, 'ma20', data.period, tz) },
          { key: 'ma60', color: ma.ma60, points: maPoints(data.indicators, 'ma60', data.period, tz) },
        ].filter(row => row.points.length > 0),
    volume,
    macd,
    cyqOverlay,
  }
}

export function periodLabel(period: ChartPeriod): string {
  return PERIOD_LABELS[period] ?? period
}

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  intraday: '分时',
  '1m': '1分',
  '5m': '5分',
  '15m': '15分',
  '30m': '30分',
  '60m': '60分',
  daily: '日K',
  '5day': '5日K',
  weekly: '周K',
  monthly: '月K',
  year1: '1年',
  year3: '3年',
  year5: '5年',
}
