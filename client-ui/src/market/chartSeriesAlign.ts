import type { Time } from 'lightweight-charts'

export interface LinePoint {
  time: Time
  /** Omit for lightweight-charts whitespace (MA warmup). */
  value?: number
}

export interface VolumePoint {
  time: Time
  value: number
  color: string
}

export interface MacdPoint {
  time: Time
  /** null = whitespace so MACD pane keeps the same logical index as K. */
  hist: number | null
  histColor: string
  dif: number | null
  dea: number | null
}

export function chartTimeKey(time: Time): string {
  if (typeof time === 'number') return String(time)
  if (typeof time === 'string') return time
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
}

/**
 * Pad MACD to every candle time. Indicator warmup drops early bars; without
 * padding, a separate MACD chart's logical index 0 is a later session than K.
 */
export function padMacdToCandleTimes(macd: MacdPoint[], times: Time[]): MacdPoint[] {
  const map = new Map(macd.map(row => [chartTimeKey(row.time), row]))
  return times.map(time => map.get(chartTimeKey(time)) ?? {
    time,
    hist: null,
    histColor: '',
    dif: null,
    dea: null,
  })
}

/** Guarantee volume bars share the same times (and count) as the price series. */
export function alignVolumeToTimes(
  volume: VolumePoint[],
  times: Time[],
  fallbackColor: string,
): VolumePoint[] {
  const map = new Map(volume.map(row => [chartTimeKey(row.time), row]))
  return times.map(time => map.get(chartTimeKey(time)) ?? {
    time,
    value: 0,
    color: fallbackColor,
  })
}

/** Pad MA to every candle time; missing slots are whitespace (no line). */
export function padLineToTimes(points: LinePoint[], times: Time[]): LinePoint[] {
  const map = new Map(points.map(row => [chartTimeKey(row.time), row]))
  return times.map(time => map.get(chartTimeKey(time)) ?? { time })
}
