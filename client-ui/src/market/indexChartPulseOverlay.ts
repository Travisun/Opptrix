import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import type { IndexMountainColors } from './chartTheme'

const STYLE_ID = 'opptrix-index-pulse-keyframes'

function ensurePulseStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
@keyframes opptrix-index-pulse-ring {
  0%, 100% { transform: translate(-50%, -50%) scale(0.72); opacity: 0.52; }
  50% { transform: translate(-50%, -50%) scale(1.45); opacity: 0.08; }
}
@keyframes opptrix-index-pulse-core {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; box-shadow: 0 0 6px var(--opptrix-pulse-glow), 0 0 14px var(--opptrix-pulse-glow); }
  50% { transform: translate(-50%, -50%) scale(1.12); opacity: 0.92; box-shadow: 0 0 10px var(--opptrix-pulse-glow), 0 0 22px var(--opptrix-pulse-glow); }
}
.opptrix-index-latest-pulse {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 2;
}
.opptrix-index-latest-pulse__ring,
.opptrix-index-latest-pulse__core {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 50%;
  will-change: transform, opacity, box-shadow;
}
.opptrix-index-latest-pulse__ring {
  width: 22px;
  height: 22px;
  background: radial-gradient(circle, var(--opptrix-pulse-glow) 0%, transparent 70%);
  animation: opptrix-index-pulse-ring 2.4s ease-in-out infinite;
}
.opptrix-index-latest-pulse__core {
  width: 7px;
  height: 7px;
  background-color: var(--opptrix-pulse-line);
  animation: opptrix-index-pulse-core 2.4s ease-in-out infinite;
}
`
  document.head.appendChild(style)
}

export type IndexPulsePoint = { time: Time; value: number }

/** 指数最新价 — 呼吸发光锚点（叠在 lightweight-charts 之上） */
export class IndexLatestPulseOverlay {
  private host: HTMLDivElement | null = null
  private chart: IChartApi | null = null
  private series: ISeriesApi<'Area'> | null = null
  private point: IndexPulsePoint | null = null
  private rangeHandler: (() => void) | null = null

  mount(
    container: HTMLDivElement,
    chart: IChartApi,
    series: ISeriesApi<'Area'>,
    point: IndexPulsePoint,
    colors: IndexMountainColors,
  ): void {
    this.unmount()
    ensurePulseStyles()
    this.chart = chart
    this.series = series
    this.point = point

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative'
    }

    const host = document.createElement('div')
    host.className = 'opptrix-index-latest-pulse'
    host.style.setProperty('--opptrix-pulse-line', colors.lineColor)
    host.style.setProperty('--opptrix-pulse-glow', colors.glowColor)

    const ring = document.createElement('div')
    ring.className = 'opptrix-index-latest-pulse__ring'
    const core = document.createElement('div')
    core.className = 'opptrix-index-latest-pulse__core'
    host.append(ring, core)
    container.appendChild(host)
    this.host = host

    const reposition = () => { this.reposition() }
    this.rangeHandler = reposition
    chart.timeScale().subscribeVisibleLogicalRangeChange(this.rangeHandler)
    reposition()
  }

  reposition(): void {
    if (!this.host || !this.chart || !this.series || !this.point) return
    const x = this.chart.timeScale().timeToCoordinate(this.point.time)
    const y = this.series.priceToCoordinate(this.point.value)
    if (x == null || y == null) {
      this.host.style.visibility = 'hidden'
      return
    }
    this.host.style.visibility = 'visible'
    const ring = this.host.querySelector<HTMLElement>('.opptrix-index-latest-pulse__ring')
    const core = this.host.querySelector<HTMLElement>('.opptrix-index-latest-pulse__core')
    for (const el of [ring, core]) {
      if (!el) continue
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
  }

  unmount(): void {
    if (this.chart && this.rangeHandler) {
      try {
        this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.rangeHandler)
      } catch { /* ignore teardown */ }
    }
    this.rangeHandler = null
    this.chart = null
    this.series = null
    this.point = null
    this.host?.remove()
    this.host = null
  }
}
