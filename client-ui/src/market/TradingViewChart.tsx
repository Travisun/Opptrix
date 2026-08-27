import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import { instrumentKey, tryParseInstrumentInput } from './instrument'
import type { InstrumentRef } from '../types/instrument'
import { hasApplicationCapability } from './capabilities'
import { isCnListedFundSymbol } from './format'
import type { ChartPeriod, OhlcChartBar, StockChartData } from '../types/market'
import { ChartWorkspace } from './chartEngine'
import { buildChartSeries, isLineChartView, periodLabel } from './chartSeries'
import { buildChartPeriodOptions, buildIndexChartPeriodOptions, CN_STOCK_CHART_PERIODS } from './chartPeriodOptions'
import { DETAIL_PANEL_CHART_MAX_HEIGHT_PX, initialFetchCount, LOAD_MORE_STEP, maxChartBars } from './chartViewConfig'
import { isLineChartPaneLabel } from './chartTime'
import { chartLivePollIntervalMs, shouldPollChartLive } from './chartLiveRefresh'
import CyqProfileStrip, { CYQ_PROFILE_STRIP_WIDTH_PX } from './CyqProfileStrip'
import { computeCyqPriceSpan, isCyqChartPeriod } from './cyqUtils'
import { indicatorColors, getMaColors } from './chartTheme'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { useTheme } from '../theme/ThemeContext'
import { ghostInteractive } from '../theme/mixins'
import { isUnifiedChart, unifiedChartToStockChart } from './instrument-adapters'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minHeight: 0,
  },
  rootExpanded: {
    flex: '0 1 auto',
    minHeight: 0,
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX}px`,
    width: '100%',
    height: 'auto',
  },
  rootEmbed: {
    flex: 1,
    minHeight: 0,
    height: '100%',
    maxHeight: 'none',
    gap: 0,
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
  periodBtn: {...ghostInteractive,

    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '3px 7px',
    borderRadius: '6px',
    cursor: 'pointer',
    lineHeight: 1.2,
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
    fontSize: 'var(--opptrix-font-xs)',
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
    flex: '0 1 auto',
    minHeight: 0,
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX - 48}px`,
    width: '100%',
    overflow: 'hidden',
  },
  chartAreaEmbed: {
    flex: 1,
    minHeight: 0,
    maxHeight: 'none',
    width: '100%',
    overflow: 'hidden',
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
    flex: '0 1 auto',
    minHeight: 0,
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX - 56}px`,
  },
  chartFrameEmbed: {
    flex: 1,
    minHeight: 0,
    maxHeight: 'none',
    borderRadius: 0,
    border: 'none',
    backgroundColor: 'transparent',
  },
  chartToolbarOverlay: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    zIndex: 3,
    pointerEvents: 'auto',
    maxWidth: 'calc(100% - 16px)',
  },
  chartToolbarOverlayBottom: {
    position: 'absolute',
    bottom: '8px',
    left: '8px',
    zIndex: 3,
    pointerEvents: 'auto',
    maxWidth: 'calc(100% - 16px)',
  },
  periodGroupOverlay: {
    backgroundColor: 'color-mix(in srgb, var(--opptrix-surface) 90%, transparent)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  chartLegendOverlay: {
    position: 'absolute',
    left: '8px',
    bottom: '8px',
    zIndex: 3,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 10px',
    padding: '4px 8px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'color-mix(in srgb, var(--opptrix-surface) 90%, transparent)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    pointerEvents: 'none',
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
    flex: '0 1 auto',
    minHeight: 0,
    maxHeight: `${DETAIL_PANEL_CHART_MAX_HEIGHT_PX - 72}px`,
    display: 'flex',
    flexDirection: 'column',
  },
  chartStackEmbed: {
    flex: 1,
    minHeight: 0,
    maxHeight: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  paneRowEmbedMain: {
    flex: 1,
    minHeight: 0,
    borderTop: 'none',
  },
  paneRowExpanded: {
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
    fontSize: 'var(--opptrix-font-xs)',
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
  paneMainExpanded: { height: '252px', minHeight: '180px', flexShrink: 0 },
  paneMainEmbed: {
    flex: 1,
    minHeight: '120px',
    height: 'auto',
  },
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
  zoomBtn: {...ghostInteractive,

    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  empty: {
    height: '222px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--opptrix-font-sm)',
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
    fontSize: 'var(--opptrix-font-xs)',
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
  cyqSpacer: {
    width: `${CYQ_PROFILE_STRIP_WIDTH_PX}px`,
    flexShrink: 0,
    alignSelf: 'stretch',
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
    fontSize: 'var(--opptrix-font-xs)',
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
  insightTopBar: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    right: '8px',
    zIndex: 4,
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: '2px',
    height: '28px',
    padding: '2px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'color-mix(in srgb, var(--opptrix-surface) 90%, transparent)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: `1px solid ${opptrixCssVars.separator}`,
    pointerEvents: 'auto',
    overflow: 'hidden',
  },
  insightTopScroll: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '6px',
    paddingRight: '2px',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  insightTopName: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  insightTopCyqItem: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.2,
  },
  insightCloseBtn: {
    ...ghostInteractive,
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    margin: '-2px 0',
    ':hover': { backgroundColor: opptrixCssVars.surfaceHover },
  },
  insightCyqDate: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.2,
    flexShrink: 0,
  },
})

interface Props {
  code: string
  /** 完整标的身份（含 exchange）— 优先于 code 解析 */
  instrument?: InstrumentRef
  /** Fill parent height (chart tab). */
  expanded?: boolean
  /** Tab/panel visible — triggers chart resize after layout. */
  active?: boolean
  /** 指数图：隐藏筹码/MACD，周期对齐券商指数页 */
  chartVariant?: 'equity' | 'index'
  /** 看板内嵌：周期浮于图内、占满父级高度、无提示文案 */
  embedMode?: boolean
  /** 数据明细分栏：标题/筹码/关闭浮于图内，图表占满高度 */
  insightEmbed?: boolean
  insightTitle?: string
  insightSubtitle?: string
  onInsightClose?: () => void
}

export default function TradingViewChart({
  code,
  instrument,
  expanded = false,
  active = true,
  chartVariant = 'equity',
  embedMode = false,
  insightEmbed = false,
  insightTitle,
  insightSubtitle,
  onInsightClose,
}: Props) {
  const s = useStyles()
  /** 按标的身份稳定，避免父组件每次 render 新建 instrument 对象导致 loadChart abort */
  const instrumentIdentity = useMemo(
    () => (instrument ? instrumentKey(instrument) : code),
    [
      code,
      instrument?.market,
      instrument?.assetClass,
      instrument?.symbol,
      instrument?.exchange,
      instrument?.quote,
    ],
  )
  const instrumentRef = useMemo(
    () => instrument ?? tryParseInstrumentInput(code) ?? {
      market: 'CN' as const,
      assetClass: 'EQUITY' as const,
      symbol: '000000',
      exchange: 'SZ',
    },
    // identity 不变时保留同一对象引用
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by instrumentIdentity
    [instrumentIdentity],
  )
  const crossMarketChart = (instrumentRef.market === 'US' || instrumentRef.market === 'HK')
    && hasApplicationCapability(instrumentRef, 'chart_daily')
  const listedCnFundChart = instrumentRef.market === 'CN'
    && instrumentRef.assetClass === 'FUND'
    && isCnListedFundSymbol(instrumentRef.symbol)
  const cnEquityChart = instrumentRef.market === 'CN'
    && (instrumentRef.assetClass === 'EQUITY'
      || instrumentRef.assetClass === 'INDEX'
      || instrumentRef.assetClass === 'ETF'
      || listedCnFundChart)
    && (hasApplicationCapability(instrumentRef, 'chart_intraday')
      || hasApplicationCapability(instrumentRef, 'chart_daily'))
  const isIndexChart = chartVariant === 'index' || instrumentRef.assetClass === 'INDEX'
  const showVolume = !isIndexChart
  const useEmbedLayout = embedMode && expanded
  const useInsightOverlay = insightEmbed && useEmbedLayout
  const canChart = cnEquityChart || crossMarketChart
  const periodOptions = useMemo(
    () => (isIndexChart
      ? buildIndexChartPeriodOptions(instrumentRef)
      : buildChartPeriodOptions(instrumentRef, { cnEquityChart, crossMarketChart })),
    [instrumentRef, cnEquityChart, crossMarketChart, isIndexChart],
  )
  const { resolvedScheme } = useTheme()
  const maColors = useMemo(() => getMaColors(resolvedScheme), [resolvedScheme])
  const [period, setPeriod] = useState<ChartPeriod>('daily')
  const [data, setData] = useState<StockChartData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

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

      const useStockApi = cnEquityChart && CN_STOCK_CHART_PERIODS.has(nextPeriod)

      const resp = useStockApi
        ? await research.stockChart(
          instrumentRef,
          nextPeriod,
          count,
          signal,
          opts?.before,
          opts?.tail,
        )
        : await research.instrumentChart(
          instrumentRef,
          nextPeriod,
          count,
          signal,
          opts?.before,
          opts?.tail,
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
      if (opts?.append && prevBarCountRef.current > 0) {
        addedBarsRef.current = resp.data.bars.length - prevBarCountRef.current
      } else if (!opts?.append && !isLive) {
        addedBarsRef.current = 0
        preserveRangeRef.current = null
      } else if (isLive) {
        addedBarsRef.current = 0
      }
      fetchCountRef.current = count
      const rawChart = isUnifiedChart(resp.data)
        ? unifiedChartToStockChart(resp.data, instrumentRef.symbol)
        : resp.data
      setData({ ...rawChart, period: nextPeriod })
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
  }, [instrumentRef, cnEquityChart, canChart])

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

  const handleNeedHistoryRef = useRef(handleNeedHistory)
  handleNeedHistoryRef.current = handleNeedHistory

  const prevInstrumentIdentityRef = useRef(instrumentIdentity)

  useEffect(() => {
    const instrumentChanged = prevInstrumentIdentityRef.current !== instrumentIdentity
    prevInstrumentIdentityRef.current = instrumentIdentity

    if (instrumentChanged) {
      setPeriod('daily')
      loadSeqRef.current += 1
    }

    dataRef.current = null
    hasDataRef.current = false
    setData(null)
    setLoading(true)
    setRefreshing(false)
    setError('')

    const loadPeriod: ChartPeriod = instrumentChanged ? 'daily' : period
    fetchCountRef.current = initialFetchCount(loadPeriod)
    const controller = new AbortController()
    void loadChart(loadPeriod, fetchCountRef.current, controller.signal)
    return () => { controller.abort() }
  }, [instrumentIdentity, period, loadChart])

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

  useLayoutEffect(() => {
    if (!data || data.bars.length === 0 || data.period !== period) return undefined
    if (!mainRef.current || !volumeRef.current) return undefined

    const workspace = workspaceRef.current
    const preserveRange = preserveRangeRef.current
    const addedBars = addedBarsRef.current
    preserveRangeRef.current = null
    addedBarsRef.current = 0

    try {
      const series = buildChartSeries(data, resolvedScheme, { indexChart: isIndexChart })
      workspace.mount(
        {
          main: mainRef.current,
          volume: volumeRef.current,
          macd: series.showMacd ? macdRef.current : null,
        },
        series,
        {
          period,
          colorScheme: resolvedScheme,
          chartTimeZone: data.chartTimeZone,
          preserveRange,
          addedBars,
          onNeedHistory: () => { handleNeedHistoryRef.current() },
        },
      )
      requestAnimationFrame(() => { workspace.resize() })
      setError(prev => (prev.startsWith('K线') || prev.includes('渲染') || prev.includes('时间轴') ? '' : prev))
    } catch (e) {
      workspace.destroy()
      setError(e instanceof Error ? e.message : '图表渲染失败')
    }

    return () => { workspace.destroy() }
  }, [data, period, resolvedScheme])

  useEffect(() => {
    if (!active || !data) return undefined
    const id = requestAnimationFrame(() => {
      workspaceRef.current.resize()
    })
    return () => { cancelAnimationFrame(id) }
  }, [active, data, expanded])

  const paneMainLabel = isLineChartPaneLabel(period) ? '分' : 'K'
  const lineChartView = Boolean(data && data.period === period && isLineChartView(period, data.bars))
  const showMacd = !isIndexChart && Boolean(
    data && !lineChartView
    && data.indicators.some(row => row.macd != null),
  )

  useEffect(() => () => { workspaceRef.current.destroy() }, [])

  const legendLine = lineChartView
  const legendOhlc = !lineChartView && data
  const cyqLatest = data?.cyqLatest ?? null
  const cyqProfile = data?.cyqProfile ?? null
  const showCyq = !isIndexChart && Boolean(
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

  const periodToolbar = (
    <div className={mergeClasses(s.periodGroup, useEmbedLayout && s.periodGroupOverlay)}>
      {periodOptions.map(item => {
        const disabled = !cnEquityChart && !crossMarketChart
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
  )

  const chartLegend = !useEmbedLayout && (legendLine || legendOhlc) && (
    <div className={mergeClasses(s.legend, s.chartLegend)}>
      {legendLine && (
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
          {!isIndexChart ? (
            <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma60 }} />MA60</span>
          ) : null}
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

  const indexEmbedLegend = useEmbedLayout && isIndexChart && legendOhlc ? (
    <div className={s.chartLegendOverlay}>
      <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma5 }} />MA5</span>
      <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma10 }} />MA10</span>
      <span className={s.legendItem}><i className={s.dot} style={{ background: maColors.ma20 }} />MA20</span>
    </div>
  ) : null

  const insightTopBar = useInsightOverlay && (insightTitle || onInsightClose) ? (
    <div className={s.insightTopBar}>
      <div className={s.insightTopScroll}>
        {insightTitle ? (
          <span className={s.insightTopName}>{insightTitle}</span>
        ) : null}
        {showCyq && cyqLatest && cyqProfile ? (
          <>
            <span className={s.insightTopCyqItem}>
              <span className={s.cyqMetricLabel}>获利 </span>
              <span className={s.cyqMetricValue} style={{ color: '#FF3B30' }}>
                {(cyqLatest.benefitPart * 100).toFixed(1)}%
              </span>
            </span>
            <span className={s.insightTopCyqItem}>
              <span className={s.cyqMetricLabel}>套牢 </span>
              <span className={s.cyqMetricValue} style={{ color: '#34C759' }}>
                {((1 - cyqLatest.benefitPart) * 100).toFixed(1)}%
              </span>
            </span>
            <span className={s.insightTopCyqItem}>
              <span className={s.cyqMetricLabel}>均成 </span>
              <span className={s.cyqMetricValue}>{cyqLatest.avgCost.toFixed(2)}</span>
            </span>
            <span className={s.insightTopCyqItem}>
              <span className={s.cyqMetricLabel}>90% </span>
              <span className={s.cyqMetricValue}>
                {cyqLatest.cost90Low.toFixed(2)}–{cyqLatest.cost90High.toFixed(2)}
              </span>
            </span>
            <span className={mergeClasses(s.insightTopCyqItem, s.insightCyqDate)}>{cyqProfile.date}</span>
          </>
        ) : null}
      </div>
      {onInsightClose ? (
        <button
          type="button"
          className={s.insightCloseBtn}
          onClick={onInsightClose}
          title="收起图表"
          aria-label="收起图表"
        >
          <DismissRegular fontSize={14} />
        </button>
      ) : null}
    </div>
  ) : null

  return (
    <div className={mergeClasses(s.root, expanded && s.rootExpanded, useEmbedLayout && s.rootEmbed)}>
      {!useEmbedLayout ? (
        <div className={s.toolbar}>{periodToolbar}</div>
      ) : null}

      {!useEmbedLayout ? (
        <div className={s.zoomRow}>
          <Text className={s.hint}>
            默认显示最新 {periodLabel(period)} · 滚轮缩放 · 左拖加载历史
          </Text>
          <button type="button" className={s.zoomBtn} onClick={resetZoom} disabled={!data}>
            最近视图
          </button>
        </div>
      ) : null}

      {showCyq && cyqLatest && cyqProfile && !useInsightOverlay && (
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
        <div className={mergeClasses(s.empty, (expanded || useInsightOverlay) && s.emptyExpanded)}>
          <Spinner size="tiny" label="加载图表…" />
        </div>
      )}
      {!loading && error && !data && (
        <div className={mergeClasses(s.empty, (expanded || useInsightOverlay) && s.emptyExpanded)}>{error}</div>
      )}

      <div className={mergeClasses(
        s.chartArea,
        expanded && s.chartAreaExpanded,
        useEmbedLayout && s.chartAreaEmbed,
        !canChart && s.paneHidden,
      )}>
        <div className={mergeClasses(
          s.chartFrame,
          expanded && s.chartFrameExpanded,
          useEmbedLayout && s.chartFrameEmbed,
        )}>
          {refreshing && (
            <div className={s.chartOverlay}>
              <Spinner size="tiny" label={`加载 ${periodLabel(period)}…`} />
            </div>
          )}

          {useEmbedLayout && !useInsightOverlay ? (
            <div className={s.chartToolbarOverlay}>{periodToolbar}</div>
          ) : null}

          {insightTopBar}

          <div className={mergeClasses(
            s.chartStack,
            expanded && s.chartStackExpanded,
            useEmbedLayout && s.chartStackEmbed,
          )}>
            <div className={mergeClasses(
              s.paneRow,
              expanded && s.paneRowExpanded,
              useEmbedLayout && s.paneRowEmbedMain,
            )}>
              {!useEmbedLayout ? <span className={s.paneLabel}>{paneMainLabel}</span> : null}
              <div className={s.paneKSplit}>
                <div className={mergeClasses(
                  s.panePlot,
                  useEmbedLayout ? s.paneMainEmbed : (expanded ? s.paneMainExpanded : s.paneMain),
                )} ref={mainRef} />
                {showCyq && cyqProfile && cyqLatest && cyqPriceSpan && (
                  <CyqProfileStrip
                    profile={cyqProfile}
                    latest={cyqLatest}
                    priceSpan={cyqPriceSpan}
                  />
                )}
              </div>
            </div>
            <div className={mergeClasses(s.paneRow, !showVolume && s.paneHidden)}>
              <span className={s.paneLabel}>V</span>
              <div className={mergeClasses(s.panePlot, expanded ? s.paneVolExpanded : s.paneVol)} ref={volumeRef} />
              {showCyq ? <div className={s.cyqSpacer} aria-hidden /> : null}
            </div>
            <div className={mergeClasses(s.paneRow, !showMacd && s.paneHidden)}>
              <span className={s.paneLabel}>M</span>
              <div className={mergeClasses(s.panePlot, expanded ? s.paneMacdExpanded : s.paneMacd)} ref={macdRef} />
              {showCyq ? <div className={s.cyqSpacer} aria-hidden /> : null}
            </div>
          </div>

          {chartLegend}
          {indexEmbedLegend}

          {useInsightOverlay ? (
            <div className={s.chartToolbarOverlayBottom}>{periodToolbar}</div>
          ) : null}
        </div>
      </div>

      {error && data && <Text className={mergeClasses(s.hint, s.hintError)}>{error}</Text>}
    </div>
  )
}
