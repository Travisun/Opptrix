import type { StockKline } from '@inno-a-stock/shared'
import type { ChipDistribution, ChipDistributionProfile, ChipPriceLevel as SchemaChipPriceLevel } from '../core/schema.js'

/** EastMoney-compatible CYQ input row (AKShare stock_cyq_em). */
export interface CyqKlineInput {
  open: number
  close: number
  high: number
  low: number
  /** Turnover rate in percent, e.g. 1.25 means 1.25%. */
  hsl: number
}

interface PercentChips {
  priceRange: [number, number]
  concentration: number
}

interface CyqCalcResult {
  benefitPart: number
  avgCost: number
  percentChips: Record<'90' | '70', PercentChips>
  profile: ChipPriceLevel[]
  currentPrice: number
}

export interface ChipPriceLevel {
  price: number
  weight: number
}

function createNumberArray(count: number): number[] {
  return Array.from({ length: count }, () => 0)
}

/** Port of EastMoney CYQCalculator (AKShare stock_cyq_em embedded JS). */
export function cyqCalculator(index: number, klinedata: CyqKlineInput[]): CyqCalcResult {
  const factor = 150
  let maxprice = 0
  let minprice = 0
  const start = 0
  const kdata = klinedata.slice(start, Math.max(1, index + 1))
  if (kdata.length === 0) throw new Error('invalid index')

  for (const elements of kdata) {
    maxprice = !maxprice ? elements.high : Math.max(maxprice, elements.high)
    minprice = !minprice ? elements.low : Math.min(minprice, elements.low)
  }

  const accuracy = Math.max(0.01, (maxprice - minprice) / (factor - 1))
  const yrange: number[] = []
  for (let i = 0; i < factor; i++) {
    yrange.push(Number((minprice + accuracy * i).toFixed(2)))
  }

  const xdata = createNumberArray(factor)

  for (const eles of kdata) {
    const { open, close, high, low } = eles
    const avg = (open + close + high + low) / 4
    const turnoverRate = Math.min(1, (eles.hsl || 0) / 100)

    const H = Math.floor((high - minprice) / accuracy)
    const L = Math.ceil((low - minprice) / accuracy)
    const GPoint: [number, number] = [
      high === low ? factor - 1 : 2 / (high - low),
      Math.floor((avg - minprice) / accuracy),
    ]

    for (let n = 0; n < xdata.length; n++) {
      xdata[n] *= (1 - turnoverRate)
    }

    if (high === low) {
      xdata[GPoint[1]] += GPoint[0] * turnoverRate / 2
    } else {
      for (let j = L; j <= H; j++) {
        const curprice = minprice + accuracy * j
        if (curprice <= avg) {
          if (Math.abs(avg - low) < 1e-8) {
            xdata[j] += GPoint[0] * turnoverRate
          } else {
            xdata[j] += ((curprice - low) / (avg - low)) * GPoint[0] * turnoverRate
          }
        } else if (Math.abs(high - avg) < 1e-8) {
          xdata[j] += GPoint[0] * turnoverRate
        } else {
          xdata[j] += ((high - curprice) / (high - avg)) * GPoint[0] * turnoverRate
        }
      }
    }
  }

  const currentprice = klinedata[index].close
  let totalChips = 0
  for (let i = 0; i < factor; i++) {
    totalChips += Number(xdata[i].toPrecision(12))
  }

  function getCostByChip(chip: number): number {
    let result = 0
    let sum = 0
    for (let i = 0; i < factor; i++) {
      const x = Number(xdata[i].toPrecision(12))
      if (sum + x > chip) {
        result = minprice + i * accuracy
        break
      }
      sum += x
    }
    return result
  }

  function computePercentChips(percent: number): PercentChips {
    if (percent > 1 || percent < 0) throw new Error('percent out of range')
    const ps = [(1 - percent) / 2, (1 + percent) / 2]
    const pr = [getCostByChip(totalChips * ps[0]), getCostByChip(totalChips * ps[1])]
    return {
      priceRange: [Number(pr[0].toFixed(2)), Number(pr[1].toFixed(2))],
      concentration: pr[0] + pr[1] === 0 ? 0 : (pr[1] - pr[0]) / (pr[0] + pr[1]),
    }
  }

  function getBenefitPart(price: number): number {
    let below = 0
    for (let i = 0; i < factor; i++) {
      const x = Number(xdata[i].toPrecision(12))
      if (price >= minprice + i * accuracy) below += x
    }
    return totalChips === 0 ? 0 : below / totalChips
  }

  return {
    benefitPart: getBenefitPart(currentprice),
    avgCost: Number(getCostByChip(totalChips * 0.5).toFixed(2)),
    percentChips: {
      '90': computePercentChips(0.9),
      '70': computePercentChips(0.7),
    },
    profile: yrange.map((price, i) => ({
      price,
      weight: Number(xdata[i].toPrecision(12)),
    })),
    currentPrice: currentprice,
  }
}

export function klinesToCyqInput(klines: StockKline[]): CyqKlineInput[] {
  return klines.map(row => ({
    open: row.open,
    close: row.close,
    high: row.high,
    low: row.low,
    hsl: row.turnoverRate ?? 0,
  }))
}

/** Compute CYQ rows for each bar (same window as AKShare, returns last `tail` rows). */
export function computeChipDistribution(
  code: string,
  klines: StockKline[],
  tail = 90,
): ChipDistribution[] {
  const inputs = klinesToCyqInput(klines)
  const rows: ChipDistribution[] = []
  for (let i = 0; i < inputs.length; i++) {
    const m = cyqCalculator(i, inputs)
    rows.push({
      code,
      date: klines[i].date.slice(0, 10),
      benefitPart: m.benefitPart,
      avgCost: m.avgCost,
      cost90Low: m.percentChips['90'].priceRange[0],
      cost90High: m.percentChips['90'].priceRange[1],
      cost90Con: m.percentChips['90'].concentration,
      cost70Low: m.percentChips['70'].priceRange[0],
      cost70High: m.percentChips['70'].priceRange[1],
      cost70Con: m.percentChips['70'].concentration,
    })
  }
  if (tail > 0 && rows.length > tail) return rows.slice(-tail)
  return rows
}

/** Latest-day CYQ metrics plus price-level profile for histogram rendering. */
export function computeLatestChipProfile(
  code: string,
  klines: StockKline[],
): ChipDistributionProfile | null {
  if (!klines.length) return null
  const inputs = klinesToCyqInput(klines)
  const index = inputs.length - 1
  const m = cyqCalculator(index, inputs)
  const maxW = Math.max(...m.profile.map(p => p.weight), 1e-12)
  return {
    code,
    date: klines[index].date.slice(0, 10),
    benefitPart: m.benefitPart,
    avgCost: m.avgCost,
    cost90Low: m.percentChips['90'].priceRange[0],
    cost90High: m.percentChips['90'].priceRange[1],
    cost90Con: m.percentChips['90'].concentration,
    cost70Low: m.percentChips['70'].priceRange[0],
    cost70High: m.percentChips['70'].priceRange[1],
    cost70Con: m.percentChips['70'].concentration,
    currentPrice: m.currentPrice,
    levels: m.profile
      .filter(p => p.weight > 0)
      .map((p): SchemaChipPriceLevel => ({ price: p.price, weight: p.weight / maxW })),
  }
}
