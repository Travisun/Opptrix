/**
 * Markdown chart / opptrix-chart 围栏 JSON 校验
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseChartFence } from '../client-ui/src/chat/chartFence.ts'

describe('parseChartFence', () => {
  it('accepts valid bar chart JSON', () => {
    const r = parseChartFence(JSON.stringify({
      type: 'bar',
      title: '营收',
      caption: '单位：亿',
      data: [
        { label: 'Q1', value: 10.2 },
        { label: 'Q2', value: 12.4, color: '#E5484D' },
      ],
      height: 160,
    }))
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.spec.type, 'bar')
    assert.equal(r.spec.data.length, 2)
    assert.equal(r.spec.height, 160)
    assert.equal(r.spec.title, '营收')
  })

  it('defaults type to bar and height to 160', () => {
    const r = parseChartFence('{"data":[{"label":"A","value":1}]}')
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.spec.type, 'bar')
    assert.equal(r.spec.height, 160)
  })

  it('rejects invalid JSON', () => {
    const r = parseChartFence('{not json')
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.match(r.reason, /JSON/)
  })

  it('rejects unsupported type', () => {
    const r = parseChartFence(JSON.stringify({
      type: 'radar',
      data: [{ label: 'A', value: 1 }],
    }))
    assert.equal(r.ok, false)
  })

  it('rejects empty or oversized data', () => {
    assert.equal(parseChartFence('{"data":[]}').ok, false)
    const data = Array.from({ length: 61 }, (_, i) => ({ label: `L${i}`, value: i }))
    assert.equal(parseChartFence(JSON.stringify({ data })).ok, false)
  })

  it('accepts series field for multi-series line', () => {
    const r = parseChartFence(JSON.stringify({
      type: 'line',
      title: '营收与净利',
      showValues: false,
      showTooltip: true,
      data: [
        { label: 'Q1', value: 10.2, series: '营收', color: '#3B82F6' },
        { label: 'Q1', value: 3.1, series: '净利' },
        { label: 'Q2', value: 12.4, series: '营收' },
        { label: 'Q2', value: 3.5, series: '净利' },
      ],
    }))
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.spec.type, 'line')
    assert.equal(r.spec.data[0]?.series, '营收')
    assert.equal(r.spec.data[1]?.series, '净利')
    assert.equal(r.spec.showValues, false)
    assert.equal(r.spec.showTooltip, true)
  })

  it('accepts up to 60 data points', () => {
    const data = Array.from({ length: 60 }, (_, i) => ({ label: `L${i}`, value: i }))
    const r = parseChartFence(JSON.stringify({ data }))
    assert.equal(r.ok, true)
  })

  it('rejects non-string series', () => {
    const r = parseChartFence(JSON.stringify({
      data: [{ label: 'A', value: 1, series: 1 }],
    }))
    assert.equal(r.ok, false)
  })

  it('rejects unsafe colors', () => {
    const r = parseChartFence(JSON.stringify({
      data: [{ label: 'A', value: 1, color: 'url(javascript:alert(1))' }],
    }))
    assert.equal(r.ok, false)
  })

  it('rejects overlong label', () => {
    const r = parseChartFence(JSON.stringify({
      data: [{ label: 'x'.repeat(81), value: 1 }],
    }))
    assert.equal(r.ok, false)
  })

  it('accepts heatmap row/col and rgba color', () => {
    const r = parseChartFence(JSON.stringify({
      type: 'heatmap',
      data: [{ label: 'c', value: 3, row: 'R1', col: 'C1', color: 'rgba(48, 164, 108, 0.9)' }],
    }))
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.spec.data[0]?.row, 'R1')
  })
})

describe('markdown lang regex for chart fences', () => {
  it('matches chart and opptrix-chart class names', () => {
    const re = /language-([\w-]+)/
    assert.equal(re.exec('language-chart')?.[1], 'chart')
    assert.equal(re.exec('language-opptrix-chart')?.[1], 'opptrix-chart')
    assert.equal(/language-(\w+)/.exec('language-opptrix-chart')?.[1], 'opptrix')
  })
})
