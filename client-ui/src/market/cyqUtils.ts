import type { ChipDistributionPoint, OhlcChartBar } from '../types/market'
import type { ChartPeriod } from '../types/market'

export function isCyqChartPeriod(period: ChartPeriod): boolean {
  return period === 'daily' || period === 'weekly' || period === 'monthly'
}

/** Price span shared by K-line pane and CYQ strip for vertical alignment. */
export function computeCyqPriceSpan(
  bars: OhlcChartBar[],
  latest: ChipDistributionPoint,
  currentPrice: number,
): { min: number; max: number } {
  const tail = bars.slice(-80)
  let min = Math.min(latest.cost90Low, currentPrice, latest.avgCost)
  let max = Math.max(latest.cost90High, currentPrice, latest.avgCost)
  for (const bar of tail) {
    min = Math.min(min, bar.low)
    max = Math.max(max, bar.high)
  }
  const pad = Math.max((max - min) * 0.05, 0.08)
  return { min: min - pad, max: max + pad }
}

export function priceToCanvasY(price: number, min: number, max: number, height: number): number {
  const span = Math.max(max - min, 0.01)
  return ((max - price) / span) * height
}
