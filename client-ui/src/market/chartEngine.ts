import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
} from 'lightweight-charts'
import type { ChartPeriod } from '../types/market'
import type { ColorScheme } from '../theme/tokens'
import type { ChartSeriesBundle } from './chartSeries'
import type { LinePoint } from './chartSeriesAlign'
import type { IndexMountainColors } from './chartTheme'
import { IndexLatestPulseOverlay, type IndexPulsePoint } from './indexChartPulseOverlay'
import {
  candlestickColors,
  getChartLayout,
  getChartTheme,
  getIndexMountainColors,
  indicatorColors,
  stockPriceFormat,
} from './chartTheme'
import { createChartAxisFormatters } from './chartAxisTime'
import { CN_TIMEZONE } from '../utils/cnTime'
import { defaultVisibleBars, HISTORY_EDGE_THRESHOLD } from './chartViewConfig'
import { isMinuteOhlcPeriod, isIntradayPeriod } from './chartTime'
import { OPPTRIX_FONT_FAMILY_CHANGE_EVENT } from '../theme/fontFamily'

const LINE_OPTS = {
  lineWidth: 1 as const,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
}

/**
 * Shared right price-scale width for K / Vol / MACD.
 * lightweight-charts only exposes minimumWidth (can grow for labels);
 * syncRightPriceScaleWidths() locks all panes to the same measured width.
 */
const PRICE_SCALE_MIN_WIDTH = 52

function applyIndexLatestPriceLine(
  area: ISeriesApi<'Area'>,
  priceLine: LinePoint[],
  colors: IndexMountainColors,
): IndexPulsePoint | null {
  const points = priceLine.filter((p): p is LinePoint & { value: number } => p.value != null)
  const last = points[points.length - 1]
  if (!last) return null

  area.createPriceLine({
    price: last.value,
    color: colors.anchorLineColor,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: '最新',
  })

  return { time: last.time, value: last.value }
}

function alignedRightPriceScale(
  extra?: { scaleMargins?: { top: number; bottom: number } },
) {
  return {
    borderVisible: false,
    // Fixed shared floor; syncRightPriceScaleWidths raises all panes together.
    minimumWidth: PRICE_SCALE_MIN_WIDTH,
    ...extra,
  }
}

function alignedTimeScaleBase(minuteChart: boolean, intradayChart: boolean) {
  const tight = minuteChart || intradayChart
  return {
    borderVisible: false,
    fixLeftEdge: false,
    fixRightEdge: true as const,
    ...(tight ? { barSpacing: 7, minBarSpacing: 2 } : {}),
  }
}

export interface ChartPaneRefs {
  main: HTMLDivElement
  volume: HTMLDivElement
  macd: HTMLDivElement | null
}

export interface ChartMountOptions {
  period: ChartPeriod
  colorScheme?: ColorScheme
  chartTimeZone?: string
  preserveRange?: LogicalRange | null
  addedBars?: number
  onNeedHistory?: () => void
}

/** Manages lightweight-charts lifecycle with safe teardown (no double-remove / stale timers). */
export class ChartWorkspace {
  private mainChart: IChartApi | null = null
  private volumeChart: IChartApi | null = null
  private macdChart: IChartApi | null = null
  private observer: ResizeObserver | null = null
  private fitTimer: ReturnType<typeof setTimeout> | null = null
  private resizeTimer: ReturnType<typeof setTimeout> | null = null
  private alive = false
  private rangeHandler: ((range: LogicalRange | null) => void) | null = null
  private paneRefs: ChartPaneRefs | null = null
  private doResize: (() => void) | null = null
  private mountOptions: ChartMountOptions | null = null
  private totalBars = 0
  private indexPulseOverlay = new IndexLatestPulseOverlay()
  private onFontFamilyChange: (() => void) | null = null

  mount(refs: ChartPaneRefs, bundle: ChartSeriesBundle, options: ChartMountOptions): void {
    this.destroy()
    this.alive = true
    this.mountOptions = options
    this.totalBars = this.countBars(bundle)
    this.paneRefs = refs
    const minuteChart = isMinuteOhlcPeriod(options.period)
    const intradayChart = isIntradayPeriod(options.period)
    const scheme = options.colorScheme ?? 'light'
    const theme = getChartTheme(scheme)
    const chartTimeZone = options.chartTimeZone ?? CN_TIMEZONE
    const axisFormat = createChartAxisFormatters(chartTimeZone, options.period)

    try {
      this.mainChart = createChart(refs.main, {
        layout: theme.layout,
        grid: theme.grid,
        localization: {
          locale: 'zh-CN',
          dateFormat: 'yyyy-MM-dd',
          timeFormatter: axisFormat.timeFormatter,
        },
        rightPriceScale: alignedRightPriceScale(),
        timeScale: {
          ...alignedTimeScaleBase(minuteChart, intradayChart),
          timeVisible: minuteChart || intradayChart,
          secondsVisible: (minuteChart && options.period === '1m') || intradayChart,
          tickMarkFormatter: axisFormat.tickMarkFormatter,
        },
        crosshair: theme.crosshair,
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: { time: true, price: false },
          mouseWheel: true,
          pinch: true,
        },
      })

      this.volumeChart = createChart(refs.volume, {
        layout: theme.layout,
        grid: theme.grid,
        rightPriceScale: alignedRightPriceScale({ scaleMargins: { top: 0.08, bottom: 0 } }),
        timeScale: {
          ...alignedTimeScaleBase(minuteChart, intradayChart),
          visible: false,
        },
        handleScroll: false,
        handleScale: false,
      })

      if (bundle.showMacd && refs.macd) {
        this.macdChart = createChart(refs.macd, {
          layout: theme.layout,
          grid: theme.grid,
          rightPriceScale: alignedRightPriceScale({ scaleMargins: { top: 0.15, bottom: 0 } }),
          timeScale: {
            ...alignedTimeScaleBase(minuteChart, intradayChart),
            visible: false,
          },
          handleScroll: false,
          handleScale: false,
        })
      }

      this.applySeries(bundle)
      this.syncTimeScales()
      this.bindResize(refs)
      this.bindFontFamilyChange()
      this.scheduleInitialView(options)
    } catch (e) {
      this.destroy()
      throw e
    }
  }

  /** Re-apply layout fonts after user switches界面字体. */
  applyFontFamily(): void {
    if (!this.alive || !this.mountOptions) return
    const scheme = this.mountOptions.colorScheme ?? 'light'
    const layout = getChartLayout(scheme)
    for (const chart of [this.mainChart, this.volumeChart, this.macdChart]) {
      if (!chart) continue
      try {
        chart.applyOptions({ layout })
      } catch { /* ignore if chart already disposed */ }
    }
  }

  private bindFontFamilyChange(): void {
    this.unbindFontFamilyChange()
    this.onFontFamilyChange = () => this.applyFontFamily()
    window.addEventListener(OPPTRIX_FONT_FAMILY_CHANGE_EVENT, this.onFontFamilyChange)
  }

  private unbindFontFamilyChange(): void {
    if (this.onFontFamilyChange) {
      window.removeEventListener(OPPTRIX_FONT_FAMILY_CHANGE_EVENT, this.onFontFamilyChange)
      this.onFontFamilyChange = null
    }
  }

  private countBars(bundle: ChartSeriesBundle): number {
    if (bundle.mode === 'intraday' || bundle.mode === 'index') return bundle.priceLine.length
    return bundle.candles.length
  }

  private setSeriesData(label: string, apply: () => void): void {
    try {
      apply()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`${label} 渲染失败：${msg}`)
    }
  }

  applySeries(bundle: ChartSeriesBundle): void {
    if (!this.mainChart || !this.volumeChart) return
    const minuteChart = this.mountOptions ? isMinuteOhlcPeriod(this.mountOptions.period) : false
    const lineOpts = minuteChart
      ? { ...LINE_OPTS, priceFormat: stockPriceFormat }
      : LINE_OPTS

    if (bundle.mode === 'intraday') {
      const price = this.mainChart.addSeries(LineSeries, {
        ...lineOpts,
        lineWidth: 2,
        color: '#FF3B30',
        priceFormat: stockPriceFormat,
      })
      this.setSeriesData('分时价格', () => price.setData(bundle.priceLine))
      const avg = this.mainChart.addSeries(LineSeries, {
        ...lineOpts,
        color: indicatorColors.avg,
        priceFormat: stockPriceFormat,
      })
      this.setSeriesData('均价', () => avg.setData(bundle.avgLine))
      if (bundle.preClose != null && bundle.preClose > 0) {
        const scheme = this.mountOptions?.colorScheme ?? 'light'
        price.createPriceLine({
          price: bundle.preClose,
          color: scheme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(60,60,67,0.35)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '昨收',
        })
      }
    } else if (bundle.mode === 'index') {
      const scheme = this.mountOptions?.colorScheme ?? 'light'
      const colors = getIndexMountainColors(scheme, bundle.indexTrend ?? 'flat')
      const area = this.mainChart.addSeries(AreaSeries, {
        lineColor: colors.lineColor,
        topColor: colors.topColor,
        bottomColor: colors.bottomColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: stockPriceFormat,
      })
      this.setSeriesData('指数走势', () => {
        area.setData(bundle.priceLine)
        const pulsePoint = applyIndexLatestPriceLine(area, bundle.priceLine, colors)
        if (pulsePoint && this.mainChart && this.paneRefs) {
          this.indexPulseOverlay.mount(
            this.paneRefs.main,
            this.mainChart,
            area,
            pulsePoint,
            colors,
          )
        }
      })
    } else {
      const candles = this.mainChart.addSeries(CandlestickSeries, {
        ...candlestickColors,
        priceFormat: stockPriceFormat,
      })
      this.setSeriesData('K线', () => candles.setData(bundle.candles))
      if (bundle.cyqOverlay) {
        const o = bundle.cyqOverlay
        candles.createPriceLine({
          price: o.cost90High,
          color: 'rgba(255,149,0,0.9)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '90高',
        })
        candles.createPriceLine({
          price: o.cost90Low,
          color: 'rgba(255,149,0,0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '90低',
        })
        candles.createPriceLine({
          price: o.avgCost,
          color: 'rgba(88,86,214,0.9)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: '均成',
        })
      }
      for (const ma of bundle.maLines) {
        const line = this.mainChart.addSeries(LineSeries, { ...lineOpts, color: ma.color })
        this.setSeriesData(ma.key, () => line.setData(ma.points.map(p => (
          p.value == null ? { time: p.time } : { time: p.time, value: p.value }
        ))))
      }
    }

    const vol = this.volumeChart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' } })
    if (bundle.volume.length > 0) {
      this.setSeriesData('成交量', () => vol.setData(bundle.volume))
    }

    if (this.macdChart && bundle.macd.length) {
      const hist = this.macdChart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
      })
      this.setSeriesData('MACD柱', () => hist.setData(bundle.macd.map(row => (
        row.hist == null
          ? { time: row.time }
          : { time: row.time, value: row.hist, color: row.histColor }
      ))))

      const dif = this.macdChart.addSeries(LineSeries, { ...LINE_OPTS, color: indicatorColors.macd })
      this.setSeriesData('DIF', () => dif.setData(bundle.macd.map(row => (
        row.dif == null ? { time: row.time } : { time: row.time, value: row.dif }
      ))))

      const dea = this.macdChart.addSeries(LineSeries, { ...LINE_OPTS, color: indicatorColors.signal })
      this.setSeriesData('DEA', () => dea.setData(bundle.macd.map(row => (
        row.dea == null ? { time: row.time } : { time: row.time, value: row.dea }
      ))))
    }

    this.syncRightPriceScaleWidths()
  }

  /**
   * LWC price scales can grow past minimumWidth (e.g. cyq 「90高/均成」 labels).
   * Lock K / Vol / MACD to the same measured width so plot left edges stay aligned.
   */
  private syncRightPriceScaleWidths(): void {
    if (!this.alive || !this.mainChart || !this.volumeChart) return
    try {
      const measured = Math.max(
        PRICE_SCALE_MIN_WIDTH,
        this.mainChart.priceScale('right').width(),
        this.volumeChart.priceScale('right').width(),
        this.macdChart?.priceScale('right').width() ?? 0,
      )
      const opts = { minimumWidth: measured }
      this.mainChart.priceScale('right').applyOptions(opts)
      this.volumeChart.priceScale('right').applyOptions(opts)
      this.macdChart?.priceScale('right').applyOptions(opts)
    } catch { /* ignore during teardown / pre-layout */ }
  }

  private applyRangeToPanes(range: LogicalRange): void {
    try {
      this.volumeChart?.timeScale().setVisibleLogicalRange(range)
      this.macdChart?.timeScale().setVisibleLogicalRange(range)
    } catch { /* ignore sync during pane rebuild */ }
  }

  /** Copy main visible range onto Vol/MACD — needed after focusRecent / resize, not only on user scroll. */
  private pushRangeToPanes(): void {
    if (!this.mainChart || !this.alive) return
    try {
      const range = this.mainChart.timeScale().getVisibleLogicalRange()
      if (!range) return
      this.applyRangeToPanes(range)
    } catch { /* ignore */ }
  }

  private syncTimeScales(): void {
    if (!this.mainChart || !this.volumeChart) return
    this.rangeHandler = range => {
      if (!range || !this.alive) return
      this.applyRangeToPanes(range)

      if (range.from <= HISTORY_EDGE_THRESHOLD) {
        this.mountOptions?.onNeedHistory?.()
      }
    }
    this.mainChart.timeScale().subscribeVisibleLogicalRangeChange(this.rangeHandler)
  }

  getVisibleLogicalRange(): LogicalRange | null {
    if (!this.mainChart) return null
    try {
      return this.mainChart.timeScale().getVisibleLogicalRange()
    } catch {
      return null
    }
  }

  resize(): void {
    this.doResize?.()
  }

  resetView(): void {
    if (!this.alive || !this.mainChart || !this.mountOptions) return
    this.focusRecent(this.totalBars, defaultVisibleBars(this.mountOptions.period))
  }

  private focusRecent(total: number, visible: number): void {
    if (!this.mainChart || total <= 0) return
    const count = Math.min(visible, total)
    const from = Math.max(0, total - count)
    const range = { from, to: total } as LogicalRange
    try {
      this.mainChart.timeScale().setVisibleLogicalRange(range)
      this.applyRangeToPanes(range)
    } catch { /* ignore */ }
  }

  private scheduleInitialView(options: ChartMountOptions): void {
    if (this.fitTimer) clearTimeout(this.fitTimer)
    this.fitTimer = setTimeout(() => {
      if (!this.alive || !this.mainChart) return
      const visible = defaultVisibleBars(options.period)
      if (options.preserveRange && options.addedBars && options.addedBars > 0) {
        const shift = options.addedBars
        const range = {
          from: options.preserveRange.from + shift,
          to: options.preserveRange.to + shift,
        } as LogicalRange
        try {
          this.mainChart.timeScale().setVisibleLogicalRange(range)
          this.applyRangeToPanes(range)
        } catch {
          this.focusRecent(this.totalBars, visible)
        }
      } else if (options.preserveRange) {
        try {
          this.mainChart.timeScale().setVisibleLogicalRange(options.preserveRange)
          this.applyRangeToPanes(options.preserveRange)
        } catch {
          this.focusRecent(this.totalBars, visible)
        }
      } else {
        this.focusRecent(this.totalBars, visible)
      }
    }, 30)
  }

  private bindResize(refs: ChartPaneRefs): void {
    this.paneRefs = refs
    const resize = () => {
      if (!this.alive) return
      if (refs.main && this.mainChart) {
        this.mainChart.applyOptions({ width: refs.main.clientWidth, height: refs.main.clientHeight })
      }
      if (refs.volume && this.volumeChart) {
        this.volumeChart.applyOptions({ width: refs.volume.clientWidth, height: refs.volume.clientHeight })
      }
      if (refs.macd && this.macdChart) {
        this.macdChart.applyOptions({ width: refs.macd.clientWidth, height: refs.macd.clientHeight })
      }
      this.syncRightPriceScaleWidths()
      this.pushRangeToPanes()
      this.indexPulseOverlay.reposition()
    }
    this.doResize = resize

    this.observer = new ResizeObserver(() => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(resize, 120)
    })
    this.observer.observe(refs.main)
    this.observer.observe(refs.volume)
    if (refs.macd) this.observer.observe(refs.macd)
    resize()
  }

  destroy(): void {
    this.alive = false
    this.unbindFontFamilyChange()
    if (this.fitTimer) {
      clearTimeout(this.fitTimer)
      this.fitTimer = null
    }
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = null
    }
    this.observer?.disconnect()
    this.observer = null

    if (this.mainChart && this.rangeHandler) {
      try {
        this.mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(this.rangeHandler)
      } catch { /* ignore */ }
    }
    this.rangeHandler = null
    this.paneRefs = null
    this.doResize = null
    this.mountOptions = null
    this.totalBars = 0

    this.indexPulseOverlay.unmount()

    for (const chart of [this.mainChart, this.volumeChart, this.macdChart]) {
      if (!chart) continue
      try {
        chart.remove()
      } catch { /* ignore double-remove */ }
    }
    this.mainChart = null
    this.volumeChart = null
    this.macdChart = null
  }
}
