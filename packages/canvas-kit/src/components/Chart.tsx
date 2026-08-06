import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx.js'
import type { CanvasSemanticTokens } from '../theme.js'
import { useCanvasTheme } from '../useCanvasTheme.js'

export type ChartDatum = {
  label: string
  value: number
  color?: string
}

export type ChartType = 'bar' | 'line' | 'pie'

export type ChartProps = {
  className?: string
  style?: CSSProperties
  type?: ChartType
  data: ChartDatum[]
  height?: number
  showLegend?: boolean
  /** Optional caption above the plot. */
  title?: ReactNode
}

const CHART_KEYS = ['chart1', 'chart2', 'chart3', 'chart4', 'chart5'] as const

function resolveColors(data: ChartDatum[], tokens: CanvasSemanticTokens): string[] {
  return data.map((d, i) => {
    if (d.color) return d.color
    const key = CHART_KEYS[i % CHART_KEYS.length]
    return tokens[key]
  })
}

function BarPlot({
  data,
  colors,
  height,
  text,
  grid,
}: {
  data: ChartDatum[]
  colors: string[]
  height: number
  text: string
  grid: string
}) {
  const pad = { t: 12, r: 8, b: 28, l: 8 }
  const w = 320
  const h = height
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const max = Math.max(...data.map((d) => d.value), 1)
  const gap = 6
  const barW = data.length ? (innerW - gap * (data.length - 1)) / data.length : 0

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="bar chart">
      <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke={grid} strokeWidth={1} />
      {data.map((d, i) => {
        const bh = (d.value / max) * innerH
        const x = pad.l + i * (barW + gap)
        const y = pad.t + innerH - bh
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(bh, 0)} fill={colors[i]} rx={2} />
            <text
              x={x + barW / 2}
              y={h - 8}
              textAnchor="middle"
              fill={text}
              fontSize={9}
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function LinePlot({
  data,
  colors,
  height,
  text,
  grid,
}: {
  data: ChartDatum[]
  colors: string[]
  height: number
  text: string
  grid: string
}) {
  const pad = { t: 12, r: 8, b: 28, l: 8 }
  const w = 320
  const h = height
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const max = Math.max(...data.map((d) => d.value), 1)
  const min = Math.min(...data.map((d) => d.value), 0)
  const span = Math.max(max - min, 1)
  const n = data.length

  const points = data.map((d, i) => {
    const x = pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = pad.t + innerH - ((d.value - min) / span) * innerH
    return { x, y, label: d.label }
  })

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="line chart">
      <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke={grid} strokeWidth={1} />
      <path d={path} fill="none" stroke={colors[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={colors[0]} />
          <text x={p.x} y={h - 8} textAnchor="middle" fill={text} fontSize={9}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function PiePlot({
  data,
  colors,
  height,
}: {
  data: ChartDatum[]
  colors: string[]
  height: number
}) {
  const size = Math.min(280, height)
  const cx0 = size / 2
  const cy0 = size / 2
  const r = size * 0.38
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1
  let angle = -Math.PI / 2

  const slices = data.map((d, i) => {
    const portion = Math.max(d.value, 0) / total
    const sweep = portion * Math.PI * 2
    const a0 = angle
    const a1 = angle + sweep
    angle = a1
    const large = sweep > Math.PI ? 1 : 0
    const x0 = cx0 + r * Math.cos(a0)
    const y0 = cy0 + r * Math.sin(a0)
    const x1 = cx0 + r * Math.cos(a1)
    const y1 = cy0 + r * Math.sin(a1)
    const dPath =
      portion >= 0.999
        ? `M ${cx0} ${cy0 - r} A ${r} ${r} 0 1 1 ${cx0 - 0.01} ${cy0 - r} Z`
        : `M ${cx0} ${cy0} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
    return <path key={i} d={dPath} fill={colors[i]} />
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="pie chart" style={{ maxWidth: size }}>
      {slices}
    </svg>
  )
}

/**
 * Lightweight SVG charts (bar / line / pie). No external chart library.
 * Series colors default to theme chart tokens via useCanvasTheme.
 */
export function Chart({
  className,
  style,
  type = 'bar',
  data,
  height = 160,
  showLegend = true,
  title,
}: ChartProps) {
  const { tokens } = useCanvasTheme()
  const colors = resolveColors(data, tokens)
  const text = tokens.textTertiary
  const grid = tokens.separator

  return (
    <div className={cx('oxc-chart', className)} style={style}>
      {title != null ? (
        <div style={{ marginBottom: tokens.spaceSm, fontWeight: 600, color: tokens.text }}>{title}</div>
      ) : null}
      {type === 'bar' ? (
        <BarPlot data={data} colors={colors} height={height} text={text} grid={grid} />
      ) : null}
      {type === 'line' ? (
        <LinePlot data={data} colors={colors} height={height} text={text} grid={grid} />
      ) : null}
      {type === 'pie' ? <PiePlot data={data} colors={colors} height={height} /> : null}
      {showLegend ? (
        <div className="oxc-chart__legend">
          {data.map((d, i) => (
            <span key={i} className="oxc-chart__legend-item">
              <span className="oxc-chart__swatch" style={{ background: colors[i] }} />
              {d.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
