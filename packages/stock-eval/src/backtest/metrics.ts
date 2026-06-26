/** Spearman rank correlation (IC proxy) */
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 5) return null
  const rank = (arr: number[]) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const ranks = new Array<number>(arr.length)
    sorted.forEach((item, r) => { ranks[item.i] = r + 1 })
    return ranks
  }
  const rx = rank(x), ry = rank(y)
  const n = x.length
  let d2 = 0
  for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2
  return 1 - (6 * d2) / (n * (n * n - 1))
}

export class FactorIC {
  readonly ics: number[] = []

  constructor(readonly factorName: string) {}

  add(ic: number | null) {
    if (ic != null && !Number.isNaN(ic)) this.ics.push(ic)
  }

  get meanIc() {
    if (!this.ics.length) return null
    return this.ics.reduce((a, b) => a + b, 0) / this.ics.length
  }

  get icir() {
    if (this.ics.length < 2) return null
    const m = this.meanIc!
    const std = Math.sqrt(this.ics.reduce((a, c) => a + (c - m) ** 2, 0) / this.ics.length)
    return std === 0 ? null : m / std
  }

  get hitRate() {
    if (!this.ics.length) return null
    return this.ics.filter(v => v > 0).length / this.ics.length
  }

  toJSON() {
    return {
      factor_name: this.factorName,
      mean_ic: this.meanIc != null ? Math.round(this.meanIc * 1000) / 1000 : null,
      icir: this.icir != null ? Math.round(this.icir * 100) / 100 : null,
      hit_rate: this.hitRate != null ? Math.round(this.hitRate * 1000) / 1000 : null,
      n_periods: this.ics.length,
    }
  }
}
