import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  LineSeries,
  type IChartApi,
  type LineData,
  type Time,
} from 'lightweight-charts'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import type { InstrumentRef } from '../types/instrument'
import { research } from '../api/client'
import type { FundNavPoint } from '../types/market'
import { useTheme } from '../theme/ThemeContext'
import { DETAIL_PANEL_CHART_MAX_HEIGHT_PX } from './chartViewConfig'
import { getChartTheme, getMaColors, stockPriceFormat } from './chartTheme'
import { compareChartTime, timeSortKey, toChartBusinessDay } from './chartTime'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    flex: '0 1 auto',
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX}px`,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflow: 'hidden',
  },
  chartFrame: {
    position: 'relative',
    flex: '1 1 auto',
    minHeight: '220px',
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX - 40}px`,
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  chart: {
    flex: 1,
    minHeight: '200px',
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX - 56}px`,
  },
  legend: {
    display: 'flex',
    gap: '12px',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    padding: '0 2px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  swatch: {
    width: '10px',
    height: '2px',
    borderRadius: '1px',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    minHeight: '220px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
  },
})

type Props = {
  instrument: InstrumentRef
  active?: boolean
}

function navPointTime(date: string): Time | null {
  return toChartBusinessDay(date)
}

function buildLineData(rows: FundNavPoint[], field: 'nav' | 'accNav'): LineData<Time>[] {
  const byTime = new Map<string, LineData<Time>>()
  for (const row of rows) {
    const value = field === 'nav' ? row.nav : row.accNav
    if (value == null || !Number.isFinite(value)) continue
    const time = navPointTime(row.date)
    if (!time) continue
    byTime.set(String(timeSortKey(time)), { time, value })
  }
  return [...byTime.values()].sort((a, b) => compareChartTime(a.time, b.time))
}

export default function FundNavChart({ instrument, active = true }: Props) {
  const s = useStyles()
  const { resolvedScheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [rows, setRows] = useState<FundNavPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState<string | undefined>()

  const maColors = useMemo(() => getMaColors(resolvedScheme), [resolvedScheme])
  const unitLine = useMemo(() => buildLineData(rows, 'nav'), [rows])
  const accLine = useMemo(() => buildLineData(rows, 'accNav'), [rows])
  const hasAccLine = accLine.length > 0

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    research.fundNav(instrument)
      .then(resp => {
        if (cancelled) return
        if (!resp.success) {
          setError(resp.message || '暂时无法加载净值走势，请稍后再试')
          setRows([])
          setSource(undefined)
          return
        }
        const raw = resp.data
        const items = Array.isArray(raw?.items) ? raw.items : []
        setRows(items)
        setSource(raw?.source)
        if (items.length === 0) {
          setError('还没有净值记录，请确认已配置数据源后重试')
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败')
          setRows([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [instrument, active])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !active || unitLine.length === 0) return undefined

    let chart: IChartApi | null = null
    try {
      const theme = getChartTheme(resolvedScheme)
      chart = createChart(el, {
        layout: theme.layout,
        grid: theme.grid,
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: 1 },
        handleScroll: { vertTouchDrag: false },
      })
      chartRef.current = chart

      const unitSeries = chart.addSeries(LineSeries, {
        color: maColors.ma5,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        priceFormat: stockPriceFormat,
      })
      unitSeries.setData(unitLine)

      if (hasAccLine) {
        const accSeries = chart.addSeries(LineSeries, {
          color: maColors.ma10,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: true,
          priceFormat: stockPriceFormat,
        })
        accSeries.setData(accLine)
      }

      chart.timeScale().fitContent()
    } catch (err) {
      chart?.remove()
      chartRef.current = null
      setError(err instanceof Error ? err.message : '净值走势渲染失败')
      return undefined
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(el)
    chartRef.current?.applyOptions({ width: el.clientWidth, height: el.clientHeight })

    return () => {
      ro.disconnect()
      chartRef.current?.remove()
      chartRef.current = null
    }
  }, [active, unitLine, accLine, hasAccLine, resolvedScheme, maColors])

  if (loading) {
    return (
      <div className={s.center}>
        <Spinner size="small" label="正在加载净值走势…" />
      </div>
    )
  }

  if (error || unitLine.length === 0) {
    return (
      <div className={s.center}>
        <Text>{error || '暂无净值数据'}</Text>
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.legend}>
        <span className={s.legendItem}>
          <span className={s.swatch} style={{ backgroundColor: maColors.ma5 }} />
          单位净值
        </span>
        {hasAccLine && (
          <span className={s.legendItem}>
            <span className={s.swatch} style={{ backgroundColor: maColors.ma10 }} />
            复权净值
          </span>
        )}
        {source === 'local' && <span>本地数据</span>}
      </div>
      <div className={s.chartFrame}>
        <div ref={containerRef} className={s.chart} />
      </div>
    </div>
  )
}
