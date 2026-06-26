import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import type { StockSnapshot } from '@inno-a-stock/shared'
import { EvaluationEngine } from '../core/engine.js'
import { REGISTRY } from '../core/registry.js'
import { createScorecard } from '../scoring/scorecard.js'
import { FactorIC, spearman } from './metrics.js'

export interface BacktestOptions {
  universe?: string[]
  factorNames?: string[]
  scorecardName?: string
  periods?: number
  forwardDays?: number
}

export class BacktestEngine {
  constructor(
    private ee: EvaluationEngine,
    private de: AshareEngine,
  ) {}

  private async fetchUniverse(limit = 80): Promise<string[]> {
    const list = await this.de.stockList()
    if (!list.success || !list.data) return ['600519', '000001', '300750']
    return list.data.slice(0, limit).map(s => s.code)
  }

  private forwardReturn(code: string, days: number): Promise<number | null> {
    return this.de.kline(code, days + 5).then(k => {
      if (!k.success || !k.data || k.data.length < days + 1) return null
      const closes = k.data.map(r => r.close)
      const old = closes[closes.length - days - 1]
      const cur = closes[closes.length - 1]
      if (!old) return null
      return ((cur - old) / old) * 100
    })
  }

  async run(opts: BacktestOptions = {}) {
    const codes = opts.universe ?? await this.fetchUniverse(60)
    const factorNames = opts.factorNames ?? REGISTRY.list().slice(0, 12)
    const periods = Math.min(opts.periods ?? 5, 20)
    const forwardDays = opts.forwardDays ?? 20

    const factorIcs = Object.fromEntries(factorNames.map(n => [n, new FactorIC(n)]))
    const scorecardIcs: Record<string, FactorIC> = {}
    if (opts.scorecardName) scorecardIcs[opts.scorecardName] = new FactorIC(opts.scorecardName)

    for (let p = 0; p < periods; p++) {
      const batch = codes.slice(p * 10, p * 10 + 20)
      if (!batch.length) break

      const snapshots: StockSnapshot[] = []
      for (const code of batch) {
        snapshots.push(await this.ee.analyze(code, factorNames))
      }

      if (opts.scorecardName) {
        createScorecard(opts.scorecardName).score(snapshots)
      }

      const rets: number[] = []
      const validCodes: string[] = []
      for (const code of batch) {
        const ret = await this.forwardReturn(code, forwardDays)
        if (ret != null) { rets.push(ret); validCodes.push(code) }
      }
      if (rets.length < 5) continue

      const snapByCode = Object.fromEntries(snapshots.map(s => [s.code, s]))

      for (const fn of factorNames) {
        const xs: number[] = [], ys: number[] = []
        for (let i = 0; i < validCodes.length; i++) {
          const v = snapByCode[validCodes[i]]?.factors[fn]?.value
          if (v != null) { xs.push(v); ys.push(rets[i]) }
        }
        factorIcs[fn].add(spearman(xs, ys))
      }

      if (opts.scorecardName) {
        const xs: number[] = [], ys: number[] = []
        for (let i = 0; i < validCodes.length; i++) {
          const sc = snapByCode[validCodes[i]]?.totalScore
          if (sc != null && sc > 0) { xs.push(sc); ys.push(rets[i]) }
        }
        scorecardIcs[opts.scorecardName].add(spearman(xs, ys))
      }
    }

    return {
      n_periods: periods,
      universe_size: codes.length,
      factor_ics: Object.values(factorIcs).map(ic => ic.toJSON()),
      scorecard_ics: Object.values(scorecardIcs).map(ic => ic.toJSON()),
    }
  }
}
