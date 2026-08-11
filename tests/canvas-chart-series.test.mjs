/**
 * canvas-kit Chart 多序列分组与密度控制（纯函数）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupCartesianData,
  resolveLegendItems,
  computeEffectiveShowValues,
  computePlotMinWidth,
  computePlotLayoutWidth,
  computePlotIntrinsicWidth,
  hasNamedSeriesField,
  buildChartOption,
} from '../packages/canvas-kit/src/components/chart-echarts.ts'

const tokens = {
  chart1: '#111111',
  chart2: '#222222',
  chart3: '#333333',
  chart4: '#444444',
  chart5: '#555555',
  text: '#000',
  textSecondary: '#666',
  separator: '#ddd',
  surfaceElevated: '#fff',
  border: '#ccc',
  borderStrong: '#999',
  fillSubtle: '#eee',
  fillMuted: '#f5f5f5',
  accentSoft: '#eef',
  accent: '#00f',
  bgAlt: '#fafafa',
  surface: '#fff',
}

describe('groupCartesianData', () => {
  it('groups long-table series with null gaps', () => {
    const data = [
      { label: 'Q1', value: 10, series: '营收', color: '#3B82F6' },
      { label: 'Q2', value: 12, series: '营收' },
      { label: 'Q1', value: 3, series: '净利', color: '#10B981' },
      // Q2 净利缺测
    ]
    assert.equal(hasNamedSeriesField(data), true)
    const g = groupCartesianData(data, tokens)
    assert.deepEqual(g.categories, ['Q1', 'Q2'])
    assert.equal(g.series.length, 2)
    assert.equal(g.series[0]?.name, '营收')
    assert.equal(g.series[0]?.color, '#3B82F6')
    assert.deepEqual(g.series[0]?.values, [10, 12])
    assert.equal(g.series[1]?.name, '净利')
    assert.equal(g.series[1]?.color, '#10B981')
    assert.deepEqual(g.series[1]?.values, [3, null])
  })

  it('single series without series field', () => {
    const data = [
      { label: 'Q1', value: 1, color: '#aaa' },
      { label: 'Q2', value: 2 },
    ]
    const g = groupCartesianData(data, tokens)
    assert.equal(g.hasNamedSeries, false)
    assert.equal(g.series.length, 1)
    assert.equal(g.series[0]?.color, '#aaa')
    assert.deepEqual(g.series[0]?.values, [1, 2])
  })
})

describe('resolveLegendItems', () => {
  it('line without series yields one legend item', () => {
    const data = [
      { label: 'Q1', value: 1, color: '#111111' },
      { label: 'Q2', value: 2, color: '#222222' },
    ]
    const colors = ['#111111', '#222222']
    const items = resolveLegendItems('line', data, colors, tokens, '近四季营收')
    assert.equal(items.length, 1)
    assert.equal(items[0]?.name, '近四季营收')
    assert.equal(items[0]?.color, '#111111')
  })

  it('multi-series yields series-name legend', () => {
    const data = [
      { label: 'Q1', value: 1, series: 'A', color: '#111111' },
      { label: 'Q1', value: 2, series: 'B', color: '#222222' },
    ]
    const items = resolveLegendItems('line', data, [], tokens)
    assert.equal(items.length, 2)
    assert.equal(items[0]?.name, 'A')
    assert.equal(items[1]?.name, 'B')
  })
})

describe('density helpers', () => {
  it('turns off values when dense', () => {
    const data = Array.from({ length: 13 }, (_, i) => ({ label: `L${i}`, value: i }))
    assert.equal(computeEffectiveShowValues('line', true, data), false)
    assert.equal(computeEffectiveShowValues('line', true, data.slice(0, 12)), true)
  })

  it('plot minWidth scales with categories (legacy intrinsic px)', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, value: i }))
    assert.equal(computePlotMinWidth('line', data), '360px')
    assert.equal(computePlotMinWidth('pie', data), undefined)
  })

  it('layout width stays compact when sparse', () => {
    const data = Array.from({ length: 3 }, (_, i) => ({ label: `L${i}`, value: i }))
    assert.equal(computePlotIntrinsicWidth('bar', data), 320)
    assert.equal(computePlotLayoutWidth('bar', data, 800), 320)
    assert.equal(computePlotLayoutWidth('pie', data, 800), 230)
    assert.equal(computePlotLayoutWidth('heatmap', data, 800), 380)
  })

  it('layout width grows with density up to available', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, value: i }))
    assert.equal(computePlotIntrinsicWidth('line', data), 720)
    assert.equal(computePlotLayoutWidth('line', data, 800), 720)
    assert.equal(computePlotLayoutWidth('line', data, 500), 500)
  })

  it('heatmap layout width scales with columns', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      label: `c${i}`,
      value: i,
      row: 'r0',
      col: `c${i}`,
    }))
    assert.equal(computePlotIntrinsicWidth('heatmap', data), Math.max(380, 12 * 36))
    assert.equal(computePlotLayoutWidth('heatmap', data, 400), 400)
  })
})

describe('buildChartOption multi-series line', () => {
  it('emits multiple line series with distinct colors', () => {
    const data = [
      { label: 'Q1', value: 10, series: '营收', color: '#3B82F6' },
      { label: 'Q1', value: 3, series: '净利', color: '#10B981' },
      { label: 'Q2', value: 12, series: '营收' },
      { label: 'Q2', value: 4, series: '净利' },
    ]
    const opt = buildChartOption({
      type: 'line',
      data,
      colors: [],
      tokens,
      showValues: true,
      showAxis: true,
      showGrid: true,
      showTooltip: true,
      showLegend: true,
    })
    const series = opt.series
    assert.ok(Array.isArray(series))
    assert.equal(series.length, 2)
    assert.equal(series[0]?.type, 'line')
    assert.equal(series[0]?.name, '营收')
    assert.equal(series[1]?.name, '净利')
    assert.equal(series[0]?.lineStyle?.color, '#3B82F6')
    assert.equal(series[1]?.lineStyle?.color, '#10B981')
  })

  it('single line uses first-point color not per-point palette', () => {
    const data = [
      { label: 'Q1', value: 1, color: '#111111' },
      { label: 'Q2', value: 2, color: '#222222' },
    ]
    const opt = buildChartOption({
      type: 'line',
      data,
      colors: ['#111111', '#222222'],
      tokens,
      showValues: true,
      showAxis: true,
      showGrid: true,
      showTooltip: false,
      showLegend: true,
    })
    const series = opt.series
    assert.ok(Array.isArray(series))
    assert.equal(series.length, 1)
    assert.equal(series[0]?.lineStyle?.color, '#111111')
    assert.equal(series[0]?.itemStyle?.color, '#111111')
  })
})
