import type { ChartPeriod, IntradayChartBar, OhlcChartBar, StockChartData } from '../types/market'
import { compareChartTime, isIntradayPeriod, isMinuteOhlcPeriod, chartTimeForPeriod, isValidChartTime } from './chartTime'
import { MARKET_DOWN, MARKET_UP, getMaColors } from './chartTheme'
import type { ColorScheme } from '../theme/tokens'
import { getOpptrixTokens } from '../theme/tokens'
import { CN_TIMEZONE } from '../utils/cnTime'
import type { Time } from 'lightweight-charts'
import {
  alignVolumeToTimes,
  chartTimeKey,
  padLineToTimes,
  padMacdToCandleTimes,
  type LinePoint,
  type MacdPoint,
  type VolumePoint,
} from './chartSeriesAlign'

export type { LinePoint, MacdPoint, VolumePoint }

export type ChartMode = 'ohlc' | 'intraday'

export interface CandlePoint {
  time: Time
  open: number
  high: number
  low: number
  close: number
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

function dedupeByTime<T extends { time: Time }>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of rows) map.set(chartTimeKey(row.time), row)
  return [...map.values()].sort((a, b) => compareChartTime(a.time, b.time))
}

function assertUniqueTimes(times: Time[], label: string, period: string): void {
  const unique = new Set(times.map(chartTimeKey))
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

export function isLineChartView(period: string, bars: StockChartData['bars']): boolean {
  return isLineChartPeriod(period, bars)
}

export interface BuildChartSeriesOptions {
  /** 指数图：对齐券商指数页，仅展示 MA5/10/20 三均线 */
  indexChart?: boolean
}

/** Normalize API payload → chart-ready series (sorted, deduped, validated). */
export function buildChartSeries(
  data: StockChartData,
  scheme: ColorScheme = 'light',
  options: BuildChartSeriesOptions = {},
): ChartSeriesBundle {
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
    const volumeRaw = dedupeByTime(bars.map((bar, i) => {
      const ref = i > 0 ? bars[i - 1].price : data.preClose
      const delta = ref == null ? null : bar.price - ref
      return {
        time: chartTime(bar.time, data.period, tz),
        value: bar.volume,
        color: volumeColor(delta, scheme),
      }
    }))
    const volume = alignVolumeToTimes(
      volumeRaw,
      priceLine.map(p => p.time),
      volumeColor(null, scheme),
    )

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
  const candles = dedupeByTime(
    bars
      .map(bar => normalizeOhlc(bar, data.period, tz))
      .filter(c => isValidChartTime(c.time)),
  )
  if (candles.length === 0 && bars.length > 0) {
    throw new Error(`${periodLabel(data.period)} 时间格式无法解析，请稍后重试`)
  }
  const candleTimes = candles.map(c => c.time)
  const volume = alignVolumeToTimes(
    dedupeByTime(
      bars.flatMap(bar => {
        const time = chartTime(bar.time, data.period, tz)
        if (!isValidChartTime(time)) return []
        return [{
          time,
          value: bar.volume,
          color: volumeColor(bar.changePct, scheme),
        }]
      }),
    ),
    candleTimes,
    volumeColor(null, scheme),
  )
  const macdRaw: MacdPoint[] = []
  for (const row of data.indicators) {
    const hist = row.macdHist
    const dif = row.macd
    const dea = row.macdSignal
    if (hist == null || dif == null || dea == null) continue
    macdRaw.push({
      time: chartTime(row.time, data.period, tz),
      hist,
      histColor: hist >= 0 ? MARKET_UP : MARKET_DOWN,
      dif,
      dea,
    })
  }
  const macd = padMacdToCandleTimes(dedupeByTime(macdRaw), candleTimes)

  assertUniqueTimes(candleTimes, periodLabel(data.period), data.period)

  const latest = data.cyqLatest
  const cyqOverlay = latest ? {
    avgCost: latest.avgCost,
    cost90Low: latest.cost90Low,
    cost90High: latest.cost90High,
    cost70Low: latest.cost70Low,
    cost70High: latest.cost70High,
  } : null

  const maKeys = minuteOhlc
    ? (['ma5', 'ma10'] as const)
    : options.indexChart
      ? (['ma5', 'ma10', 'ma20'] as const)
      : (['ma5', 'ma10', 'ma20', 'ma60'] as const)
  const maLines = maKeys
    .map(key => ({
      key,
      color: ma[key],
      points: padLineToTimes(maPoints(data.indicators, key, data.period, tz), candleTimes),
    }))
    .filter(row => row.points.some(p => p.value != null))

  return {
    mode: 'ohlc',
    showMacd,
    candles,
    priceLine: [],
    avgLine: [],
    maLines,
    volume,
    macd,
    cyqOverlay,
  }
}

export { alignVolumeToTimes, padLineToTimes, padMacdToCandleTimes }

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
  '5day': '5日',
  weekly: '周K',
  monthly: '月K',
  quarterly: '季K',
  yearly: '年K',
  year1: '近1年日K',
  year3: '近3年日K',
  year5: '近5年日K',
}
