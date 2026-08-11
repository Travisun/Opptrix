import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { cx } from '../cx.js'
import {
  buildChartOption,
  computePlotIntrinsicWidth,
  computePlotLayoutWidth,
  echarts,
  resolveLegendItems,
  resolveSeriesColors,
} from './chart-echarts.js'
import { useCanvasTheme } from '../useCanvasTheme.js'

export type ChartDatum = {
  label: string
  value: number
  color?: string
  /**
   * 可选系列名（长表多序列）。任一数据点带 series 时，bar/line 按系列分组画多条线/多组柱；
   * 图例为系列名。无 series 时：bar/pie 按点上色；line 单系列统一主色、图例仅 1 项。
   */
  series?: string
  /** Heatmap row key（heatmap 单元格必填；缺则跳过该点）。 */
  row?: string
  /** Heatmap column key（heatmap 单元格必填；缺则跳过该点）。 */
  col?: string
}

/** Chart kinds — histogram-style discrete compare uses `bar`. */
export type ChartType = 'bar' | 'line' | 'pie' | 'heatmap'

export type ChartProps = {
  className?: string
  style?: CSSProperties
  type?: ChartType
  data: ChartDatum[]
  height?: number
  showLegend?: boolean
  /** Optional title above the plot (centered with the chart). */
  title?: ReactNode
  /** Optional caption below the plot / legend (centered with the chart). */
  caption?: ReactNode
  /** Value labels on bars / points / pie % / heatmap cells. Default true. */
  showValues?: boolean
  /** Category + value axes (Cartesian). Pie ignores. Default true. */
  showAxis?: boolean
  /** Split lines / grid. Default true. */
  showGrid?: boolean
  /** Hover tooltip. Default false. */
  showTooltip?: boolean
}

/**
 * Theme-aware charts via ECharts (bar / line / pie / heatmap).
 * Agents import only `{ Chart }` from `@opptrix/canvas` — not echarts.
 * Plot width adapts to data density up to the parent/container width (never forced to 100% when sparse).
 */
export function Chart({
  className,
  style,
  type = 'bar',
  data,
  height = 160,
  showLegend = true,
  title,
  caption,
  showValues = true,
  showAxis = true,
  showGrid = true,
  showTooltip = false,
}: ChartProps) {
  const { tokens } = useCanvasTheme()
  const colors = resolveSeriesColors(data, tokens)
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null)
  /** null = not measured yet; use intrinsic until parent width is known */
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  const plotWidth =
    availableWidth == null
      ? computePlotIntrinsicWidth(type, data)
      : computePlotLayoutWidth(type, data, availableWidth)
  const needsScroll = availableWidth != null && plotWidth > availableWidth
  const titleForLegend = typeof title === 'string' ? title : undefined
  const legendItems = resolveLegendItems(type, data, colors, tokens, titleForLegend)

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return

    const measure = () => {
      const parent = el.parentElement
      const w = parent != null ? parent.clientWidth : el.clientWidth
      setAvailableWidth(Math.max(1, w))
    }
    measure()

    const ro = new ResizeObserver(measure)
    if (el.parentElement) ro.observe(el.parentElement)
    else ro.observe(el)

    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      chart.resize()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(
      buildChartOption({
        type,
        data,
        colors,
        tokens,
        showValues,
        showAxis,
        showGrid,
        showTooltip,
        showLegend,
      }),
      true,
    )
    chart.resize()
  }, [
    type,
    data,
    colors,
    tokens,
    showValues,
    showAxis,
    showGrid,
    showTooltip,
    showLegend,
    height,
    plotWidth,
  ])

  const aria =
    type === 'bar'
      ? '柱状图'
      : type === 'line'
        ? '折线图'
        : type === 'pie'
          ? '饼图'
          : '热力图'

  const rootStyle: CSSProperties = {
    ...style,
    width: plotWidth,
    maxWidth: '100%',
    ['--oxc-chart-plot-width' as string]: `${plotWidth}px`,
  }

  return (
    <div
      ref={rootRef}
      className={cx('oxc-chart', `oxc-chart--${type}`, className)}
      style={rootStyle}
    >
      {title != null ? <div className="oxc-chart__title">{title}</div> : null}
      <div className="oxc-chart__body">
        <div
          className={cx('oxc-chart__scroll', needsScroll && 'oxc-chart__scroll--overflow')}
        >
          <div
            ref={hostRef}
            className="oxc-chart__plot"
            style={{ height, width: plotWidth, maxWidth: '100%' }}
            role="img"
            aria-label={aria}
          />
        </div>
        {showLegend && type !== 'heatmap' && legendItems.length > 0 ? (
          <div className="oxc-chart__legend">
            {legendItems.map((item, i) => (
              <span key={`${item.name}-${i}`} className="oxc-chart__legend-item">
                <span className="oxc-chart__swatch" style={{ background: item.color }} />
                {item.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {caption != null ? <div className="oxc-chart__caption">{caption}</div> : null}
    </div>
  )
}
