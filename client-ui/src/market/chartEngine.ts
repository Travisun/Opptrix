import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type LogicalRange,
} from 'lightweight-charts'
import type { ChartPeriod } from '../types/market'
import type { ChartSeriesBundle } from './chartSeries'
import {
  candlestickColors,
  chartGrid,
  chartLayout,
  indicatorColors,
  stockPriceFormat,
} from './chartTheme'
import { defaultVisibleBars, HISTORY_EDGE_THRESHOLD } from './chartViewConfig'
import { isMinuteOhlcPeriod } from './chartTime'

const LINE_OPTS = {
  lineWidth: 1 as const,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
}

export interface ChartPaneRefs {
  main: HTMLDivElement
  volume: HTMLDivElement
  macd: HTMLDivElement | null
}

export interface ChartMountOptions {
  period: ChartPeriod
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

  mount(refs: ChartPaneRefs, bundle: ChartSeriesBundle, options: ChartMountOptions): void {
    this.destroy()
    this.alive = true
    this.mountOptions = options
    this.totalBars = this.countBars(bundle)
    const minuteChart = isMinuteOhlcPeriod(options.period)

    try {
      this.mainChart = createChart(refs.main, {
        layout: chartLayout,
        grid: chartGrid,
        rightPriceScale: {
          borderVisible: false,
          ...(minuteChart ? { minimumWidth: 52 } : {}),
        },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: false,
          fixRightEdge: true,
          timeVisible: true,
          secondsVisible: minuteChart && options.period === '1m',
          ...(minuteChart ? { barSpacing: 7, minBarSpacing: 2 } : {}),
        },
        crosshair: {
          vertLine: { width: 1, color: 'rgba(60,60,67,0.16)' },
          horzLine: { width: 1, color: 'rgba(60,60,67,0.16)' },
        },
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
        layout: chartLayout,
        grid: chartGrid,
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0 } },
        timeScale: { visible: false, borderVisible: false },
        handleScroll: false,
        handleScale: false,
      })

      if (bundle.showMacd && refs.macd) {
        this.macdChart = createChart(refs.macd, {
          layout: chartLayout,
          grid: chartGrid,
          rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0 } },
          timeScale: { visible: false, borderVisible: false },
          handleScroll: false,
          handleScale: false,
        })
      }

      this.applySeries(bundle)
      this.syncTimeScales()
      this.bindResize(refs)
      this.scheduleInitialView(options)
    } catch (e) {
      this.destroy()
      throw e
    }
  }

  private countBars(bundle: ChartSeriesBundle): number {
    if (bundle.mode === 'intraday') return bundle.priceLine.length
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
      const price = this.mainChart.addSeries(LineSeries, { ...lineOpts, lineWidth: 2, color: '#FF3B30' })
      this.setSeriesData('分时价格', () => price.setData(bundle.priceLine))
      const avg = this.mainChart.addSeries(LineSeries, { ...lineOpts, color: indicatorColors.avg })
      this.setSeriesData('均价', () => avg.setData(bundle.avgLine))
    } else {
      const candles = this.mainChart.addSeries(CandlestickSeries, {
        ...candlestickColors,
        priceFormat: stockPriceFormat,
      })
      this.setSeriesData('K线', () => candles.setData(bundle.candles))
      for (const ma of bundle.maLines) {
        const line = this.mainChart.addSeries(LineSeries, { ...lineOpts, color: ma.color })
        this.setSeriesData(ma.key, () => line.setData(ma.points))
      }
    }

    const vol = this.volumeChart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' } })
    this.setSeriesData('成交量', () => vol.setData(bundle.volume))

    if (this.macdChart && bundle.macd.length) {
      const hist = this.macdChart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
      })
      this.setSeriesData('MACD柱', () => hist.setData(bundle.macd.map(row => ({
        time: row.time,
        value: row.hist,
        color: row.histColor,
      }))))

      const dif = this.macdChart.addSeries(LineSeries, { ...LINE_OPTS, color: indicatorColors.macd })
      this.setSeriesData('DIF', () => dif.setData(bundle.macd.map(row => ({ time: row.time, value: row.dif }))))

      const dea = this.macdChart.addSeries(LineSeries, { ...LINE_OPTS, color: indicatorColors.signal })
      this.setSeriesData('DEA', () => dea.setData(bundle.macd.map(row => ({ time: row.time, value: row.dea }))))
    }
  }

  private syncTimeScales(): void {
    if (!this.mainChart || !this.volumeChart) return
    this.rangeHandler = range => {
      if (!range || !this.alive) return
      try {
        this.volumeChart?.timeScale().setVisibleLogicalRange(range)
        this.macdChart?.timeScale().setVisibleLogicalRange(range)
      } catch { /* ignore sync during pane rebuild */ }

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
    try {
      this.mainChart.timeScale().setVisibleLogicalRange({ from, to: total })
    } catch { /* ignore */ }
  }

  private scheduleInitialView(options: ChartMountOptions): void {
    if (this.fitTimer) clearTimeout(this.fitTimer)
    this.fitTimer = setTimeout(() => {
      if (!this.alive || !this.mainChart) return
      const visible = defaultVisibleBars(options.period)
      if (options.preserveRange && options.addedBars && options.addedBars > 0) {
        const shift = options.addedBars
        try {
          this.mainChart.timeScale().setVisibleLogicalRange({
            from: options.preserveRange.from + shift,
            to: options.preserveRange.to + shift,
          })
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
