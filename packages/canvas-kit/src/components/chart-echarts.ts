/**
 * ECharts option builders for @opptrix/canvas Chart.
 * Agents must not import echarts — only Chart from '@opptrix/canvas'.
 */
import * as echarts from 'echarts'
import type { CanvasSemanticTokens } from '../theme.js'
import type { ChartDatum, ChartType } from './Chart.js'

type EChartsOption = echarts.EChartsOption

export { echarts }

const CHART_KEYS = ['chart1', 'chart2', 'chart3', 'chart4', 'chart5'] as const

export function resolveSeriesColors(
  data: ChartDatum[],
  tokens: CanvasSemanticTokens,
): string[] {
  return data.map((d, i) => {
    if (d.color) return d.color
    const key = CHART_KEYS[i % CHART_KEYS.length]
    return tokens[key]
  })
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh'))
}

function formatValue(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 100 || Number.isInteger(n)) return String(Math.round(n * 100) / 100)
  if (abs >= 10) return n.toFixed(1)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function paramValue(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (Array.isArray(raw) && raw.length >= 3) return Number(raw[2])
  if (raw && typeof raw === 'object' && 'value' in raw) {
    return paramValue((raw as { value: unknown }).value)
  }
  return Number(raw ?? 0)
}

function asRecord(p: unknown): Record<string, unknown> {
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : {}
}

export type ChartOptionInput = {
  type: ChartType
  data: ChartDatum[]
  colors: string[]
  tokens: CanvasSemanticTokens
  showValues: boolean
  showAxis: boolean
  showGrid: boolean
  showTooltip: boolean
  /** Heatmap visualMap visibility; bar/line/pie use HTML legend in Chart.tsx. */
  showLegend: boolean
}

function axisCommon(tokens: CanvasSemanticTokens, showAxis: boolean, showGrid: boolean) {
  return {
    axisLine: {
      show: showAxis,
      lineStyle: { color: tokens.separator },
    },
    axisTick: { show: showAxis },
    axisLabel: {
      show: showAxis,
      color: tokens.textSecondary,
      fontSize: 10,
    },
    splitLine: {
      show: showGrid,
      lineStyle: { color: tokens.separator, type: 'dashed' as const },
    },
  }
}

function tooltipBase(tokens: CanvasSemanticTokens, showTooltip: boolean) {
  if (!showTooltip) return { show: false as const }
  return {
    show: true as const,
    backgroundColor: tokens.surfaceElevated,
    borderColor: tokens.border,
    borderWidth: 1,
    textStyle: { color: tokens.text, fontSize: 12 },
  }
}

function buildCartesian(
  input: ChartOptionInput,
  seriesType: 'bar' | 'line',
): EChartsOption {
  const { data, colors, tokens, showValues, showAxis, showGrid, showTooltip } = input
  const labels = data.map((d) => d.label)
  const values = data.map((d) => d.value)
  const axis = axisCommon(tokens, showAxis, showGrid)
  const palette = data.map((_, i) => colors[i] ?? tokens.chart1)

  return {
    animationDuration: 280,
    grid: {
      left: showAxis ? 40 : 12,
      right: 12,
      top: showValues ? 28 : 16,
      bottom: showAxis ? 28 : 12,
      containLabel: false,
    },
    tooltip: {
      ...tooltipBase(tokens, showTooltip),
      trigger: showTooltip ? 'axis' : 'item',
      axisPointer: showTooltip
        ? { type: seriesType === 'bar' ? 'shadow' : 'line' }
        : undefined,
    },
    xAxis: {
      type: 'category',
      data: labels,
      ...axis,
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: seriesType === 'line',
      ...axis,
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      seriesType === 'bar'
        ? {
            type: 'bar' as const,
            data: values.map((v, i) => ({
              value: v,
              itemStyle: { color: palette[i], borderRadius: [2, 2, 0, 0] },
            })),
            barMaxWidth: 36,
            label: {
              show: showValues,
              position: 'top' as const,
              color: tokens.textSecondary,
              fontSize: 10,
              formatter: (p: unknown) => formatValue(paramValue(asRecord(p).value)),
            },
            emphasis: { focus: 'series' as const },
          }
        : {
            type: 'line' as const,
            data: values,
            itemStyle: { color: colors[0] ?? tokens.chart1 },
            lineStyle: { width: 2, color: colors[0] ?? tokens.chart1 },
            symbol: 'circle',
            symbolSize: 6,
            label: {
              show: showValues,
              position: 'top' as const,
              color: tokens.textSecondary,
              fontSize: 10,
              formatter: (p: unknown) => formatValue(paramValue(asRecord(p).value)),
            },
            emphasis: { focus: 'series' as const },
          },
    ],
  }
}

function buildPie(input: ChartOptionInput): EChartsOption {
  const { data, colors, tokens, showValues, showTooltip } = input

  return {
    animationDuration: 280,
    tooltip: {
      ...tooltipBase(tokens, showTooltip),
      trigger: 'item',
      formatter: (p: unknown) => {
        const r = asRecord(p)
        const pct = typeof r.percent === 'number' ? r.percent.toFixed(1) : '0'
        const name = typeof r.name === 'string' ? r.name : ''
        return `${name}<br/>${formatValue(paramValue(r.value))}（${pct}%）`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['0%', '68%'],
        center: ['50%', '50%'],
        data: data.map((d, i) => ({
          name: d.label,
          value: Math.max(d.value, 0),
          itemStyle: { color: colors[i] ?? tokens.chart1 },
        })),
        label: {
          show: showValues,
          color: tokens.textSecondary,
          fontSize: 10,
          formatter: (p: unknown) => {
            const r = asRecord(p)
            const pct = typeof r.percent === 'number' ? r.percent.toFixed(0) : '0'
            const name = typeof r.name === 'string' ? r.name : ''
            return `${name}\n${pct}%`
          },
        },
        labelLine: {
          show: showValues,
          lineStyle: { color: tokens.separator },
        },
        emphasis: {
          itemStyle: { shadowBlur: 0 },
        },
      },
    ],
  }
}

function buildHeatmap(input: ChartOptionInput): EChartsOption {
  const { data, tokens, showValues, showAxis, showGrid, showTooltip, showLegend } = input
  const cells = data.filter(
    (d) => d.row != null && d.row !== '' && d.col != null && d.col !== '',
  )
  const rows = uniqueSorted(cells.map((d) => d.row as string))
  const cols = uniqueSorted(cells.map((d) => d.col as string))
  const heatLow = tokens.fillSubtle || tokens.accentSoft
  const heatHigh = tokens.chart1 || tokens.accent

  const values = cells.map((d) => d.value)
  const vmin = values.length ? Math.min(...values) : 0
  const vmax = values.length ? Math.max(...values) : 1

  const heatData: Array<
    [number, number, number] | { value: [number, number, number]; itemStyle: { color: string } }
  > = []
  for (const d of cells) {
    const ci = cols.indexOf(d.col as string)
    const ri = rows.indexOf(d.row as string)
    if (ci < 0 || ri < 0) continue
    if (d.color) {
      heatData.push({
        value: [ci, ri, d.value],
        itemStyle: { color: d.color },
      })
    } else {
      heatData.push([ci, ri, d.value])
    }
  }

  const axis = axisCommon(tokens, showAxis, showGrid)

  return {
    animationDuration: 280,
    tooltip: {
      ...tooltipBase(tokens, showTooltip),
      trigger: 'item',
      formatter: (p: unknown) => {
        const v = asRecord(p).value
        if (!Array.isArray(v) || v.length < 3) return ''
        const col = cols[Number(v[0])] ?? ''
        const row = rows[Number(v[1])] ?? ''
        return `${row} · ${col}<br/>${formatValue(Number(v[2]))}`
      },
    },
    grid: {
      left: showAxis ? 52 : 12,
      right: showLegend ? 48 : 12,
      top: 16,
      bottom: showAxis ? 28 : 12,
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: cols,
      ...axis,
      splitArea: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: rows,
      ...axis,
      splitArea: { show: false },
      splitLine: {
        show: showGrid,
        lineStyle: { color: tokens.separator, type: 'dashed' },
      },
    },
    visualMap: {
      show: showLegend,
      min: vmin,
      max: vmax === vmin ? vmin + 1 : vmax,
      calculable: false,
      orient: 'vertical',
      right: 0,
      top: 'center',
      itemWidth: 8,
      itemHeight: 64,
      text: ['高', '低'],
      textStyle: { color: tokens.textSecondary, fontSize: 10 },
      inRange: { color: [heatLow, heatHigh] },
      outOfRange: { color: [tokens.fillMuted] },
    },
    series: [
      {
        type: 'heatmap',
        data: heatData,
        label: {
          show: showValues,
          color: tokens.text,
          fontSize: 9,
          formatter: (p: unknown) => formatValue(paramValue(asRecord(p).value)),
        },
        itemStyle: {
          borderColor: tokens.bgAlt || tokens.surface,
          borderWidth: 2,
          borderRadius: 2,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 0,
            borderWidth: 1,
            borderColor: tokens.borderStrong,
          },
        },
      },
    ],
  }
}

export function buildChartOption(input: ChartOptionInput): EChartsOption {
  switch (input.type) {
    case 'line':
      return buildCartesian(input, 'line')
    case 'pie':
      return buildPie(input)
    case 'heatmap':
      return buildHeatmap(input)
    case 'bar':
    default:
      return buildCartesian(input, 'bar')
  }
}
