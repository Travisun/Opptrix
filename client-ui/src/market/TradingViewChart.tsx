import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { research } from '../api/client'
import { parseInstrumentInput } from './instrument'
import { hasApplicationCapability } from './capabilities'
import type { ChartPeriod, OhlcChartBar, StockChartData } from '../types/market'
import { ChartWorkspace } from './chartEngine'
import { buildChartSeries, periodLabel } from './chartSeries'
import { initialFetchCount, LOAD_MORE_STEP, maxChartBars } from './chartViewConfig'
import { isIntradayPeriod, isMinuteOhlcPeriod } from './chartTime'
import { chartLivePollIntervalMs, shouldPollChartLive } from './chartLiveRefresh'
import CyqProfileStrip from './CyqProfileStrip'
import { computeCyqPriceSpan, isCyqChartPeriod } from './cyqUtils'
import { indicatorColors, getMaColors } from './chartTheme'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { useTheme } from '../theme/ThemeContext'
import { ghostInteractive } from '../theme/mixins'

const PERIODS: { id: ChartPeriod; label: string; tradingOnly?: boolean }[] = [
  { id: 'intraday', label: '分时', tradingOnly: true },
  { id: '1m', label: '1分' },
  { id: '5m', label: '5分' },
  { id: '15m', label: '15分' },
  { id: '30m', label: '30分' },
  { id: '60m', label: '60分' },
  { id: 'daily', label: '日K' },
  { id: 'weekly', label: '周K' },
  { id: 'monthly', label: '月K' },
]

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minHeight: 0,
  },
  rootExpanded: {
    flexShrink: 0,
    width: '100%',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px 8px',
  },
  periodGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px',
    padding: '2px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  periodBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 7px',
    borderRadius: '6px',
    cursor: 'pointer',
    lineHeight: 1.2,
    ...ghostInteractive,
  },
  periodBtnActive: {
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textPrimary,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  periodBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px 10px',
    fontSize: '9px',
    color: opptrixCssVars.textTertiary,
  },
  chartLegend: {
    flexShrink: 0,
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    padding: '4px 8px',
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  chartArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flexShrink: 0,
  },
  chartAreaExpanded: {
    width: '100%',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
  },
  dot: {
    width: '5px',
    height: '5px',
    borderRadius: '999px',
    flexShrink: 0,
  },
  chartFrame: {
    position: 'relative',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  chartFrameExpanded: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '360px',
  },
  chartOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    pointerEvents: 'none',
  },
  chartStack: {
    display: 'flex',
    flexDirection: 'column',
    '& > :first-child': { borderTop: 'none' },
  },
  chartStackExpanded: {
    flexShrink: 0,
  },
  paneRow: {
    display: 'flex',
    alignItems: 'stretch',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
  },
  paneHidden: {
    display: 'none',
  },
  paneLabel: {
    width: '14px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '7px',
    fontWeight: 600,
    letterSpacing: 0,
    color: opptrixCssVars.textTertiary,
    opacity: 0.65,
    padding: 0,
  },
  panePlot: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    '& a[href*="tradingview"]': { display: 'none !important' },
    '& [class*="attribution"]': { display: 'none !important', opacity: '0 !important' },
  },
  paneMain: { height: '148px' },
  paneMainExpanded: { minHeight: '300px', height: '300px' },
  paneVol: { height: '38px' },
  paneVolExpanded: { height: '46px', flexShrink: 0 },
  paneMacd: { height: '36px' },
  paneMacdExpanded: { height: '42px', flexShrink: 0 },
  zoomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  zoomBtn: {
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    ...ghostInteractive,
  },
  empty: {
    height: '222px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  emptyExpanded: {
    flex: 1,
    minHeight: '200px',
  },
  hint: {
    fontSize: '9px',
    color: opptrixCssVars.textTertiary,
  },
  hintError: {
    color: opptrixCssVars.textSecondary,
  },
  paneKSplit: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'stretch',
  },
  cyqMetrics: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px 10px',
    padding: '4px 8px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    fontSize: '9px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.3,
  },
  cyqMetricLabel: {
    color: opptrixCssVars.textTertiary,
    fontWeight: 600,
  },
  cyqMetricValue: {
    color: opptrixCssVars.textPrimary,
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
  },
  cyqStackBar: {
    display: 'flex',
    width: '72px',
    height: '6px',
    borderRadius: '3px',
    overflow: 'hidden',
    flexShrink: 0,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  cyqStackProfit: {
    backgroundColor: 'rgba(255, 59, 48, 0.85)',
  },
  cyqStackLoss: {
    flex: 1,
    backgroundColor: 'rgba(52, 199, 89, 0.65)',
  },
})

interface Props {
  code: string
  /** Fill parent height (chart tab). */
  expanded?: boolean
  /** Tab/panel visible — triggers chart resize after layout. */
  active?: boolean
}

export default function TradingViewChart({ code, expanded = false, active = true }: Props) {
  const s = useStyles()
  const instrumentRef = useMemo(() => parseInstrumentInput(code), [code])
  const cnEquityChart = hasApplicationCapability(instrumentRef, 'chart_intraday')
    || (instrumentRef.market === 'CN' && instrumentRef.assetClass === 'EQUITY')
  const canChart = hasApplicationCapability(instrumentRef, 'chart_daily')
  const { resolvedScheme } = useTheme()
  const maColors = useMemo(() => getMaColors(resolvedScheme), [resolvedScheme])
  const [period, setPeriod] = useState<ChartPeriod>('daily')
  const [data, setData] = useState<StockChartData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [intradayAvailable, setIntradayAvailable] = useState(true)

  const mainRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const macdRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef(new ChartWorkspace())
  const loadSeqRef = useRef(0)
  const hasDataRef = useRef(false)
  const dataRef = useRef<StockChartData | null>(null)
  const loadingMoreRef = useRef(false)
  const preserveRangeRef = useRef<import('lightweight-charts').LogicalRange | null>(null)
  const addedBarsRef = useRef(0)
  const prevBarCountRef = useRef(0)
  const fetchCountRef = useRef(initialFetchCount('daily'))
  const lastHistoryLoadRef = useRef(0)
  const periodRef = useRef(period)
  const activeRef = useRef(active)

  useEffect(() => { periodRef.current = period }, [period])
  useEffect(() => { activeRef.current = active }, [active])

  useEffect(() => {
    hasDataRef.current = data != null
    dataRef.current = data
  }, [data])

  const loadChart = useCallback(async (
    nextPeriod: ChartPeriod,
    count: number,
    signal?: AbortSignal,
    opts?: { append?: boolean; before?: string; tail?: number; live?: boolean },
  ) => {
    const seq = ++loadSeqRef.current
    const hasChart = hasDataRef.current
    const isLive = Boolean(opts?.live)
    if (opts?.append) {
      preserveRangeRef.current = workspaceRef.current.getVisibleLogicalRange()
      prevBarCountRef.current = dataRef.current?.bars.length ?? 0
    } else if (!hasChart || isLive) {
      if (!isLive) {
        preserveRangeRef.current = null
        addedBarsRef.current = 0
      }
    } else {
      preserveRangeRef.current = null
      addedBarsRef.current = 0
    }
    if (hasChart && !isLive) setRefreshing(true)
    else if (!hasChart) setLoading(true)
    setError('')

    try {
      if (!canChart && !cnEquityChart) {
        setError('该标的暂不支持图表')
        if (!hasChart) setData(null)
        return
      }

      const useStockApi = cnEquityChart
        && (isIntradayPeriod(nextPeriod) || isMinuteOhlcPeriod(nextPeriod)
          || nextPeriod === 'daily' || nextPeriod === 'weekly' || nextPeriod === 'monthly')

      const resp = useStockApi
        ? await research.stockChart(
          code,
          nextPeriod,
          count,
          signal,
          opts?.before,
          opts?.tail,
        )
        : await research.instrumentChart(
          instrumentRef,
          nextPeriod === 'weekly' ? 'weekly' : nextPeriod === 'monthly' ? 'monthly' : 'daily',
          count,
          signal,
        )
      if (seq !== loadSeqRef.current || signal?.aborted) return
      if (!resp.success || !resp.data) {
        setError(resp.message || '图表加载失败')
        if (!hasChart) setData(null)
        return
      }
      if (resp.data.bars.length === 0 && resp.message) {
        setError(resp.message)
        if (!hasChart) setData(null)
        return
      }
      if (nextPeriod === 'intraday') {
        const ok = resp.data.bars.length > 0
        setIntradayAvailable(ok)
        if (!ok) {
          setError(resp.message || '暂无分时数据')
          if (!hasChart) setData(null)
          return
        }
      }
      if (opts?.append && prevBarCountRef.current > 0) {
        addedBarsRef.current = resp.data.bars.length - prevBarCountRef.current
      } else if (!opts?.append && !isLive) {
        addedBarsRef.current = 0
        preserveRangeRef.current = null
      } else if (isLive) {
        addedBarsRef.current = 0
      }
      fetchCountRef.current = count
      setData(resp.data)
    } catch (e) {
      if (seq !== loadSeqRef.current || signal?.aborted) return
      if (e instanceof Error && e.name !== 'AbortError') {
        setError(e.message || '图表加载失败')
        if (!hasChart) setData(null)
      }
    } finally {
      if (seq === loadSeqRef.current && !signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [code, instrumentRef, cnEquityChart, canChart])

  const handleNeedHistory = useCallback(() => {
    const now = Date.now()
    if (now - lastHistoryLoadRef.current < 1500) return
    const current = dataRef.current
    if (!current?.hasMore || loadingMoreRef.current) return
    const cap = maxChartBars(current.period)
    const next = Math.min(current.bars.length + LOAD_MORE_STEP, cap)
    if (next <= current.bars.length) return
    const firstBar = current.bars[0]
    const before = firstBar && 'time' in firstBar ? String(firstBar.time) : ''
    lastHistoryLoadRef.current = now
    loadingMoreRef.current = true
    void loadChart(current.period, next, undefined, {
      append: true,
      before,
      tail: current.bars.length,
    }).finally(() => {
      loadingMoreRef.current = false
    })
  }, [loadChart])

  useEffect(() => {
    setPeriod('daily')
    setData(null)
    setError('')
    fetchCountRef.current = initialFetchCount('daily')
    loadSeqRef.current += 1
  }, [code])

  useEffect(() => {
    fetchCountRef.current = initialFetchCount(period)
    const controller = new AbortController()
    void loadChart(period, fetchCountRef.current, controller.signal)
    return () => { controller.abort() }
  }, [code, period, loadChart])

  useEffect(() => {
    const tradingDay = data?.isTradingDay
    if (!shouldPollChartLive(period, active, tradingDay)) return undefined

    const poll = () => {
      const currentPeriod = periodRef.current
      if (!shouldPollChartLive(currentPeriod, activeRef.current, dataRef.current?.isTradingDay)) return
      if (loadingMoreRef.current) return

      const range = workspaceRef.current.getVisibleLogicalRange()
      const total = dataRef.current?.bars.length ?? 0
      if (range && total > 0 && range.to < total - 3) {
        preserveRangeRef.current = range
      } else {
        preserveRangeRef.current = null
      }

      void loadChart(currentPeriod, fetchCountRef.current, undefined, { live: true })
    }

    const intervalMs = chartLivePollIntervalMs(period)
    const id = window.setInterval(poll, intervalMs)
    return () => { window.clearInterval(id) }
  }, [period, active, data?.isTradingDay, loadChart])

  useEffect(() => {
    if (!cnEquityChart) {
      setIntradayAvailable(false)
      if (isIntradayPeriod(period) || isMinuteOhlcPeriod(period)) setPeriod('daily')
      return undefined
    }
    const controller = new AbortController()
    research.stockChart(code, 'intraday', undefined, controller.signal)
      .then(resp => {
        if (controller.signal.aborted || !resp.success || !resp.data) return
        setIntradayAvailable(resp.data.bars.length > 0)
      })
      .catch(() => {})
    return () => { controller.abort() }
  }, [code, cnEquityChart, period])

  useEffect(() => {
    if (!data || !mainRef.current || !volumeRef.current || !macdRef.current) return undefined

    const workspace = workspaceRef.current
    const preserveRange = preserveRangeRef.current
    const addedBars = addedBarsRef.current
    preserveRangeRef.current = null
    addedBarsRef.current = 0

    try {
      const series = buildChartSeries(data, resolvedScheme)
      workspace.mount(
        {
          main: mainRef.current,
          volume: volumeRef.current,
          macd: series.showMacd ? macdRef.current : null,
        },
        series,
        {
          period: data.period,
          colorScheme: resolvedScheme,
          preserveRange,
          addedBars,
          onNeedHistory: handleNeedHistory,
        },
      )
      setError(prev => (prev.startsWith('K线') || prev.includes('渲染') || prev.includes('时间轴') ? '' : prev))
    } catch (e) {
      workspace.destroy()
      setError(e instanceof Error ? e.message : '图表渲染失败')
    }

    return () => { workspace.destroy() }
  }, [data, handleNeedHistory, resolvedScheme])

  useEffect(() => {
    if (!active || !data) return undefined
    const id = requestAnimationFrame(() => {
      workspaceRef.current.resize()
    })
    return () => { cancelAnimationFrame(id) }
  }, [active, data, expanded])

  const showMacd = Boolean(
    data && !isIntradayPeriod(data.period) && !isMinuteOhlcPeriod(data.period)
    && data.indicators.some(row => row.macd != null),
  )
  const intraday = data ? isIntradayPeriod(data.period) : isIntradayPeriod(period)

  useEffect(() => () => { workspaceRef.current.destroy() }, [])

  const legendIntraday = intraday && data
  const legendOhlc = !intraday && data
  const cyqLatest = data?.cyqLatest ?? null
  const cyqProfile = data?.cyqProfile ?? null
  const showCyq = Boolean(
    isCyqChartPeriod(period)
    && cyqLatest
    && cyqProfile
    && cyqProfile.levels.length > 0,
  )
  const cyqPriceSpan = useMemo(() => {
    if (!showCyq || !cyqLatest || !cyqProfile || !data) return null
    const ohlc = data.bars as OhlcChartBar[]
    return computeCyqPriceSpan(ohlc, cyqLatest, cyqProfile.currentPrice)
  }, [showCyq, cyqLatest, cyqProfile, data])

  const resetZoom = () => { workspaceRef.current.resetView() }

  const chartLegend = (legendIntraday || legendOhlc) && (
    <div className={mergeClasses(s.legend, s.chartLegend)}>
      {legendIntraday && (
        <>
          <span className={s.legendItem}><i className={s.dot} style={{ background: '#FF3B30' }} />价格</span>
          <span className={s.legendItem}><i className={s.dot} style={{ background: indicatorColors.avg }} />均价</span>
        </>
      )}
      {legendOhlc && (
        <>
          <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma5 }} />MA5</span>
          <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma10 }} />MA10</span>
          <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma20 }} />MA20</span>
          <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma60 }} />MA60</span>
          {showMacd && (
            <>
              <span className={s.legendItem}><i className={s.dot} style={{ background: indicatorColors.macd }} />DIF</span>
              <span className={s.legendItem}><i className={s.dot} style={{ background: indicatorColors.signal }} />DEA</span>
            </>
          )}
          {showCyq && (
            <>
              <span className={s.legendItem}><i className={s.dot} style={{ background: 'rgba(255,149,0,0.85)' }} />90%成本</span>
              <span className={s.legendItem}><i className={s.dot} style={{ background: '#5856D6' }} />均成</span>
            </>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className={mergeClasses(s.root, expanded && s.rootExpanded)}>
      <div className={s.toolbar}>
        <div className={s.periodGroup}>
          {PERIODS.map(item => {
            const disabled = (!cnEquityChart && (isIntradayPeriod(item.id) || isMinuteOhlcPeriod(item.id)))
              || (item.tradingOnly && !intradayAvailable && item.id === 'intraday')
            const activeTab = period === item.id
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                className={mergeClasses(s.periodBtn, activeTab && s.periodBtnActive, disabled && s.periodBtnDisabled)}
                onClick={() => { if (item.id !== period) setPeriod(item.id) }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className={s.zoomRow}>
        <Text className={s.hint}>
          {intraday
            ? (data?.sessionDate && !data.isTradingDay
              ? `${data.sessionDate} 收盘分时 · 滚轮缩放 · 左拖查看更早`
              : '默认显示最新时段 · 滚轮缩放 · 左拖查看更早')
            : `默认显示最新 ${periodLabel(period)} · 滚轮缩放 · 左拖加载历史`}
        </Text>
        <button type="button" className={s.zoomBtn} onClick={resetZoom} disabled={!data}>
          最近视图
        </button>
      </div>

      {showCyq && cyqLatest && cyqProfile && (
        <div className={s.cyqMetrics}>
          <span>
            <span className={s.cyqMetricLabel}>获利 </span>
            <span className={s.cyqMetricValue} style={{ color: '#FF3B30' }}>
              {(cyqLatest.benefitPart * 100).toFixed(1)}%
            </span>
          </span>
          <span>
            <span className={s.cyqMetricLabel}>套牢 </span>
            <span className={s.cyqMetricValue} style={{ color: '#34C759' }}>
              {((1 - cyqLatest.benefitPart) * 100).toFixed(1)}%
            </span>
          </span>
          <div className={s.cyqStackBar} title="获利 / 套牢占比">
            <div className={s.cyqStackProfit} style={{ width: `${Math.max(cyqLatest.benefitPart * 100, 0.5)}%` }} />
            <div className={s.cyqStackLoss} />
          </div>
          <span>
            <span className={s.cyqMetricLabel}>现价 </span>
            <span className={s.cyqMetricValue}>{cyqProfile.currentPrice.toFixed(2)}</span>
          </span>
          <span>
            <span className={s.cyqMetricLabel}>均成 </span>
            <span className={s.cyqMetricValue}>{cyqLatest.avgCost.toFixed(2)}</span>
          </span>
          <span>
            <span className={s.cyqMetricLabel}>90% </span>
            <span className={s.cyqMetricValue}>
              {cyqLatest.cost90Low.toFixed(2)}–{cyqLatest.cost90High.toFixed(2)}
            </span>
          </span>
          <Text className={s.hint}>{cyqProfile.date}</Text>
        </div>
      )}

      {loading && !data && (
        <div className={mergeClasses(s.empty, expanded && s.emptyExpanded)}>
          <Spinner size="tiny" label="加载图表…" />
        </div>
      )}
      {!loading && error && !data && (
        <div className={mergeClasses(s.empty, expanded && s.emptyExpanded)}>{error}</div>
      )}

      <div className={mergeClasses(s.chartArea, expanded && s.chartAreaExpanded, !data && s.paneHidden)}>
        <div className={mergeClasses(s.chartFrame, expanded && s.chartFrameExpanded)}>
          {refreshing && (
            <div className={s.chartOverlay}>
              <Spinner size="tiny" label={`加载 ${periodLabel(period)}…`} />
            </div>
          )}

          <div className={mergeClasses(s.chartStack, expanded && s.chartStackExpanded)}>
            <div className={s.paneRow}>
              <span className={s.paneLabel}>{intraday ? '分' : 'K'}</span>
              <div className={s.paneKSplit}>
                <div className={mergeClasses(s.panePlot, expanded ? s.paneMainExpanded : s.paneMain)} ref={mainRef} />
                {showCyq && cyqProfile && cyqLatest && cyqPriceSpan && (
                  <CyqProfileStrip
                    profile={cyqProfile}
                    latest={cyqLatest}
                    priceSpan={cyqPriceSpan}
                  />
                )}
              </div>
            </div>
            <div className={s.paneRow}>
              <span className={s.paneLabel}>V</span>
              <div className={mergeClasses(s.panePlot, expanded ? s.paneVolExpanded : s.paneVol)} ref={volumeRef} />
            </div>
            <div className={mergeClasses(s.paneRow, !showMacd && s.paneHidden)}>
              <span className={s.paneLabel}>M</span>
              <div className={mergeClasses(s.panePlot, expanded ? s.paneMacdExpanded : s.paneMacd)} ref={macdRef} />
            </div>
          </div>

          {chartLegend}
        </div>
      </div>

      {error && data && <Text className={mergeClasses(s.hint, s.hintError)}>{error}</Text>}
    </div>
  )
}
