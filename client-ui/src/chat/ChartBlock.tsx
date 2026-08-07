import { Chart } from '@opptrix/canvas'
import '@opptrix/canvas/styles.css'
import { useTheme } from '../theme/ThemeContext'
import { parseChartFence } from './chartFence'

interface Props {
  code: string
}

function ChartError({ reason }: { reason?: string }) {
  return (
    <div className="opptrix-md-chart opptrix-md-chart--error" role="status">
      <p className="opptrix-md-chart-err">
        图表暂时无法显示
        {reason ? <span className="opptrix-md-chart-err-reason">（{reason}）</span> : null}
      </p>
    </div>
  )
}

/** Markdown ```chart``` / ```opptrix-chart``` → `@opptrix/canvas` Chart */
export default function ChartBlock({ code }: Props) {
  const { resolvedScheme } = useTheme()
  const parsed = parseChartFence(code)

  if (!parsed.ok) {
    return <ChartError reason={parsed.reason} />
  }

  const { spec } = parsed

  return (
    <div
      className="opptrix-md-chart"
      data-theme={resolvedScheme}
      aria-label="图表"
    >
      <Chart
        type={spec.type}
        data={spec.data}
        height={spec.height}
        title={spec.title}
        caption={spec.caption}
        showLegend={spec.showLegend}
        showValues={spec.showValues}
        showAxis={spec.showAxis}
        showGrid={spec.showGrid}
        showTooltip={spec.showTooltip}
      />
    </div>
  )
}

export { parseChartFence } from './chartFence'
