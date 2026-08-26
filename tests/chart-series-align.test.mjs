/**
 * K / Vol / MACD 时间轴对齐：同一套 time 点（指标预热用 whitespace）
 *
 * buildChartSeries 在 Node ESM 下无法直接加载（Vite 无后缀 import），
 * 对齐逻辑抽在 chartSeriesAlign.ts（无运行时依赖），与 buildChartSeries 调用同一套函数。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  alignVolumeToTimes,
  padLineToTimes,
  padMacdToCandleTimes,
} from '../client-ui/src/market/chartSeriesAlign.ts'

describe('padMacdToCandleTimes', () => {
  it('pads missing warmup bars so length and times match candles', () => {
    const times = [
      { year: 2024, month: 1, day: 2 },
      { year: 2024, month: 1, day: 3 },
      { year: 2024, month: 1, day: 4 },
    ]
    const macd = [{
      time: times[2],
      hist: 0.5,
      histColor: '#FF3B30',
      dif: 0.2,
      dea: 0.1,
    }]
    const padded = padMacdToCandleTimes(macd, times)
    assert.equal(padded.length, times.length)
    assert.equal(padded[0].hist, null)
    assert.equal(padded[0].dif, null)
    assert.equal(padded[1].hist, null)
    assert.equal(padded[2].hist, 0.5)
    assert.equal(padded[2].dif, 0.2)
    assert.deepEqual(padded.map(row => row.time), times)
  })
})

describe('alignVolumeToTimes', () => {
  it('fills missing volume slots with 0 so count matches price times', () => {
    const times = [1, 2, 3]
    const volume = [{ time: 2, value: 9, color: '#fff' }]
    const aligned = alignVolumeToTimes(volume, times, '#ccc')
    assert.equal(aligned.length, 3)
    assert.equal(aligned[0].value, 0)
    assert.equal(aligned[1].value, 9)
    assert.equal(aligned[2].value, 0)
    assert.deepEqual(aligned.map(row => row.time), times)
  })
})

describe('padLineToTimes', () => {
  it('keeps MA warmup as whitespace (no value) on early bars', () => {
    const times = [10, 20, 30]
    const padded = padLineToTimes([{ time: 30, value: 12.5 }], times)
    assert.equal(padded.length, 3)
    assert.equal(padded[0].value, undefined)
    assert.equal(padded[2].value, 12.5)
  })
})

describe('buildChartSeries pane contract (same helpers)', () => {
  it('daily: volume and MACD lengths equal candle count after align', () => {
    const candles = [
      { year: 2024, month: 1, day: 2 },
      { year: 2024, month: 1, day: 3 },
      { year: 2024, month: 1, day: 4 },
      { year: 2024, month: 1, day: 5 },
      { year: 2024, month: 1, day: 8 },
    ]
    const volumeRaw = candles.slice(0, 4).map((time, i) => ({
      time,
      value: 1000 + i,
      color: '#f00',
    }))
    const macdRaw = [{
      time: candles[3],
      hist: 0.04,
      histColor: '#FF3B30',
      dif: 0.12,
      dea: 0.08,
    }, {
      time: candles[4],
      hist: 0.05,
      histColor: '#FF3B30',
      dif: 0.13,
      dea: 0.09,
    }]
    const volume = alignVolumeToTimes(volumeRaw, candles, '#ccc')
    const macd = padMacdToCandleTimes(macdRaw, candles)
    const ma5 = padLineToTimes([{ time: candles[2], value: 101 }], candles)

    assert.equal(volume.length, candles.length)
    assert.equal(macd.length, candles.length)
    assert.equal(ma5.length, candles.length)
    assert.deepEqual(volume.map(row => row.time), candles)
    assert.deepEqual(macd.map(row => row.time), candles)
    assert.equal(macd[0].hist, null)
    assert.equal(macd[2].hist, null)
    assert.equal(macd[3].hist, 0.04)
    assert.equal(macd[4].dif, 0.13)
    assert.equal(volume[4].value, 0)
    assert.equal(ma5[0].value, undefined)
    assert.equal(ma5[2].value, 101)
  })

  it('minute timestamps: same length after align', () => {
    const times = [1_704_166_860, 1_704_166_920, 1_704_166_980, 1_704_167_040]
    const volume = alignVolumeToTimes(
      times.map(time => ({ time, value: 200, color: '#0f0' })),
      times,
      '#ccc',
    )
    const macd = padMacdToCandleTimes([], times)
    assert.equal(volume.length, times.length)
    assert.equal(macd.length, times.length)
    assert.ok(macd.every(row => row.hist == null))
  })
})
