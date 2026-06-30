import type { AshareEngine } from '@opptrix/a-stock-layer'
import type { FactorResult, StockSnapshot } from '@opptrix/shared'
import { REGISTRY } from './registry.js'

export class EvaluationEngine {
  constructor(private de: AshareEngine) {}

  async analyze(code: string, factorNames?: string[]): Promise<StockSnapshot> {
    let name = code
    const rt = await this.de.realtime(code)
    if (rt.success && rt.data?.[0]) name = rt.data[0].name || code

    const snapshot: StockSnapshot = {
      code, name, factors: {}, scores: {}, totalScore: 0,
    }
    const names = factorNames ?? REGISTRY.list()
    for (const fname of names) {
      const f = REGISTRY.get(fname)
      if (!f) continue
      try {
        snapshot.factors[fname] = await f.compute(this.de, code)
      } catch (e) {
        snapshot.factors[fname] = {
          name: fname, value: null, meta: f.meta,
          details: { error: String(e) },
        }
      }
    }
    return snapshot
  }

  getFactorValue(snapshot: StockSnapshot, name: string): number | null {
    return snapshot.factors[name]?.value ?? null
  }
}

export type { FactorResult, StockSnapshot }
