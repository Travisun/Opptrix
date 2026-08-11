/**
 * ECharts option builders for Canvas Chart.
 * Agents must not import echarts — only Chart from '@opptrix/canvas'.
 */
import * as echarts from 'echarts'
import type { CanvasSemanticTokens } from '../theme.js'
import type { ChartDatum, ChartType } from './Chart.js'

type EChartsOption = echarts.EChartsOption

export { echarts }

const CHART_KEYS = ['chart1', 'chart2', 'chart3', 'chart4', 'chart5'] as const

const DENSE_VALUE_LIMIT = 12
const HEATMAP_VALUE_LIMIT = 16
const CATEGORY_ROTATE_THRESHOLD = 8
const PX_PER_CATEGORY = 36

/** Compact default plot widths (match former CSS max-width). */
const COMPACT_PLOT_WIDTH: Record<ChartType, number> = {
  bar: 320,
  line: 320,
  pie: 230,
  heatmap: 380,
}

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

export type CartesianSeriesGroup = {
  name: string
  color: string
  values: Array<number | null>
}

export type CartesianGrouped = {
  categories: string[]
  series: CartesianSeriesGroup[]
  hasNamedSeries: boolean
}

/** 是否存在非空 series 字段（长表多序列）。 */
export function hasNamedSeriesField(data: ChartDatum[]): boolean {
  return data.some((d) => typeof d.series === 'string' && d.series.trim() !== '')
}

/**
 * 长表 → 宽表：按 series 分组；categories = label 首次出现顺序；缺测点 null。
 * 无 series 时返回单系列（颜色取首点或 chart1）。
 */
export function groupCartesianData(
  data: ChartDatum[],
  tokens: CanvasSemanticTokens,
): CartesianGrouped {
  if (!hasNamedSeriesField(data)) {
    const color = data[0]?.color ?? tokens.chart1
    return {
      categories: data.map((d) => d.label),
      series: [
        {
          name: '趋势',
          color,
          values: data.map((d) => d.value),
        },
      ],
      hasNamedSeries: false,
    }
  }

  const categories: string[] = []
  const catIndex = new Map<string, number>()
  for (const d of data) {
    if (!catIndex.has(d.label)) {
      catIndex.set(d.label, categories.length)
      categories.push(d.label)
    }
  }

  const seriesNames: string[] = []
  const seriesIndex = new Map<string, number>()
  for (const d of data) {
    const name = (d.series ?? '').trim() || '默认'
    if (!seriesIndex.has(name)) {
      seriesIndex.set(name, seriesNames.length)
      seriesNames.push(name)
    }
  }

  const series: CartesianSeriesGroup[] = seriesNames.map((name, si) => {
    const values: Array<number | null> = categories.map(() => null)
    let color: string | undefined
    for (const d of data) {
      const sn = (d.series ?? '').trim() || '默认'
      if (sn !== name) continue
      const ci = catIndex.get(d.label)
      if (ci === undefined) continue
      values[ci] = d.value
      if (color === undefined && d.color) color = d.color
    }
    if (color === undefined) {
      color = tokens[CHART_KEYS[si % CHART_KEYS.length]]
    }
    return { name, color, values }
  })

  return { categories, series, hasNamedSeries: true }
}

export type ChartLegendItem = {
  name: string
  color: string
}

/**
 * HTML 图例项：多序列用系列名；单折线 1 项；bar/pie 无 series 时按点。
 */
export function resolveLegendItems(
  type: ChartType,
  data: ChartDatum[],
  colors: string[],
  tokens: CanvasSemanticTokens,
  title?: string,
): ChartLegendItem[] {
  if (type === 'heatmap') return []

  if (hasNamedSeriesField(data) && (type === 'bar' || type === 'line')) {
    const grouped = groupCartesianData(data, tokens)
    return grouped.series.map((s) => ({ name: s.name, color: s.color }))
  }

  if (type === 'line') {
    const color = data[0]?.color ?? colors[0] ?? tokens.chart1
    const name = title?.trim() || '趋势'
    return [{ name, color }]
  }

  return data.map((d, i) => ({
    name: d.label,
    color: colors[i] ?? tokens.chart1,
  }))
}

function cartesianCategoryCount(data: ChartDatum[]): number {
  if (!hasNamedSeriesField(data)) return data.length
  const seen = new Set<string>()
  for (const d of data) seen.add(d.label)
  return seen.size
}

function cartesianSeriesCount(data: ChartDatum[]): number {
  if (!hasNamedSeriesField(data)) return 1
  const seen = new Set<string>()
  for (const d of data) seen.add((d.series ?? '').trim() || '默认')
  return seen.size
}

/** 过密时自动关闭数值标注（不改用户 showTooltip）。 */
export function computeEffectiveShowValues(
  type: ChartType,
  showValues: boolean,
  data: ChartDatum[],
): boolean {
  if (!showValues) return false
  if (type === 'heatmap') {
    const cells = data.filter(
      (d) => d.row != null && d.row !== '' && d.col != null && d.col !== '',
    ).length
    return cells <= HEATMAP_VALUE_LIMIT
  }
  if (type === 'pie') {
    return data.length <= DENSE_VALUE_LIMIT
  }
  if (hasNamedSeriesField(data)) {
    return cartesianCategoryCount(data) * cartesianSeriesCount(data) <= DENSE_VALUE_LIMIT
  }
  return data.length <= DENSE_VALUE_LIMIT
}

function heatmapColumnCount(data: ChartDatum[]): number {
  const cols = new Set<string>()
  for (const d of data) {
    if (d.col != null && d.col !== '') cols.add(d.col)
  }
  return cols.size
}

/**
 * Intrinsic plot width from data density (before clamping to container).
 * Sparse charts stay near compact defaults; dense bar/line/heatmap grow with categories/columns.
 */
export function computePlotIntrinsicWidth(type: ChartType, data: ChartDatum[]): number {
  const compact = COMPACT_PLOT_WIDTH[type]
  if (type === 'pie') return compact
  if (type === 'heatmap') {
    const cols = heatmapColumnCount(data)
    if (cols <= 0) return compact
    return Math.max(compact, cols * PX_PER_CATEGORY)
  }
  const n = cartesianCategoryCount(data)
  if (n <= 0) return compact
  return Math.max(compact, n * PX_PER_CATEGORY)
}

/**
 * Adaptive plot width: min(available, max(compact, intrinsic)).
 * Sparse data → compact (does not stretch to 100% Surface).
 * Dense data → grows up to availableWidthPx (prefer fitting over horizontal scroll).
 */
export function computePlotLayoutWidth(
  type: ChartType,
  data: ChartDatum[],
  availableWidthPx: number,
): number {
  const available = Math.max(1, Math.floor(availableWidthPx))
  const compact = COMPACT_PLOT_WIDTH[type]
  const intrinsic = computePlotIntrinsicWidth(type, data)
  return Math.min(available, Math.max(compact, intrinsic))
}

/**
 * @deprecated Prefer `computePlotLayoutWidth`. Kept for callers/tests that only need intrinsic px.
 * bar/line: intrinsic pixel string; pie/heatmap: undefined (legacy scroll path).
 */
export function computePlotMinWidth(type: ChartType, data: ChartDatum[]): string | undefined {
  if (type !== 'bar' && type !== 'line') return undefined
  const n = cartesianCategoryCount(data)
  if (n <= 0) return undefined
  return `${Math.max(COMPACT_PLOT_WIDTH[type], n * PX_PER_CATEGORY)}px`
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

function axisCommon(
  tokens: CanvasSemanticTokens,
  showAxis: boolean,
  showGrid: boolean,
  categoryCount?: number,
) {
  const dense = categoryCount != null && categoryCount > CATEGORY_ROTATE_THRESHOLD
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
      hideOverlap: true,
      interval: 'auto' as const,
      rotate: dense ? 35 : 0,
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

function valueLabel(
  show: boolean,
  tokens: CanvasSemanticTokens,
): {
  show: boolean
  position: 'top'
  color: string
  fontSize: number
  formatter: (p: unknown) => string
} {
  return {
    show,
    position: 'top',
    color: tokens.textSecondary,
    fontSize: 10,
    formatter: (p: unknown) => formatValue(paramValue(asRecord(p).value)),
  }
}

function buildCartesian(
  input: ChartOptionInput,
  seriesType: 'bar' | 'line',
): EChartsOption {
  const { data, colors, tokens, showValues, showAxis, showGrid, showTooltip } = input
  const effectiveShowValues = computeEffectiveShowValues(seriesType, showValues, data)
  const named = hasNamedSeriesField(data)

  if (named) {
    const grouped = groupCartesianData(data, tokens)
    const n = grouped.categories.length
    const axis = axisCommon(tokens, showAxis, showGrid, n)
    const bottomPad = showAxis ? (n > CATEGORY_ROTATE_THRESHOLD ? 44 : 28) : 12

    return {
      animationDuration: 280,
      grid: {
        left: showAxis ? 12 : 12,
        right: 12,
        top: effectiveShowValues ? 28 : 16,
        bottom: bottomPad,
        containLabel: true,
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
        data: grouped.categories,
        ...axis,
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: seriesType === 'line',
        ...axisCommon(tokens, showAxis, showGrid),
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: grouped.series.map((s) =>
        seriesType === 'bar'
          ? {
              name: s.name,
              type: 'bar' as const,
              data: s.values,
              itemStyle: { color: s.color, borderRadius: [2, 2, 0, 0] },
              barMaxWidth: 28,
              label: valueLabel(effectiveShowValues, tokens),
              emphasis: { focus: 'series' as const },
              connectNulls: false,
            }
          : {
              name: s.name,
              type: 'line' as const,
              data: s.values,
              itemStyle: { color: s.color },
              lineStyle: { width: 2, color: s.color },
              symbol: 'circle',
              symbolSize: 6,
              label: valueLabel(effectiveShowValues, tokens),
              emphasis: { focus: 'series' as const },
              connectNulls: false,
            },
      ),
    }
  }

  // —— 无 series：bar 按点上色；line 单系列统一主色 ——
  const labels = data.map((d) => d.label)
  const values = data.map((d) => d.value)
  const n = labels.length
  const axis = axisCommon(tokens, showAxis, showGrid, n)
  const palette = data.map((_, i) => colors[i] ?? tokens.chart1)
  const lineColor = data[0]?.color ?? colors[0] ?? tokens.chart1
  const bottomPad = showAxis ? (n > CATEGORY_ROTATE_THRESHOLD ? 44 : 28) : 12

  return {
    animationDuration: 280,
    grid: {
      left: showAxis ? 12 : 12,
      right: 12,
      top: effectiveShowValues ? 28 : 16,
      bottom: bottomPad,
      containLabel: true,
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
      ...axisCommon(tokens, showAxis, showGrid),
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
            label: valueLabel(effectiveShowValues, tokens),
            emphasis: { focus: 'series' as const },
          }
        : {
            type: 'line' as const,
            data: values,
            itemStyle: { color: lineColor },
            lineStyle: { width: 2, color: lineColor },
            symbol: 'circle',
            symbolSize: 6,
            label: valueLabel(effectiveShowValues, tokens),
            emphasis: { focus: 'series' as const },
          },
    ],
  }
}

function buildPie(input: ChartOptionInput): EChartsOption {
  const { data, colors, tokens, showValues, showTooltip } = input
  const effectiveShowValues = computeEffectiveShowValues('pie', showValues, data)

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
          show: effectiveShowValues,
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
          show: effectiveShowValues,
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
  const effectiveShowValues = computeEffectiveShowValues('heatmap', showValues, data)
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

  const axis = axisCommon(tokens, showAxis, showGrid, cols.length)

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
      left: showAxis ? 12 : 12,
      right: showLegend ? 48 : 12,
      top: 16,
      bottom: showAxis ? 28 : 12,
      containLabel: true,
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
      ...axisCommon(tokens, showAxis, showGrid),
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
          show: effectiveShowValues,
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
