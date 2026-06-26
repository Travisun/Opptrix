import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import { EvaluationEngine } from '../core/engine.js'
import { createScorecard } from '../scoring/scorecard.js'

export interface ScreenCondition {
  factor: string
  op: '>' | '<' | '>=' | '<=' | '='
  value: number
}

function passes(value: number | null, op: string, target: number): boolean {
  if (value == null) return false
  switch (op) {
    case '>': return value > target
    case '<': return value < target
    case '>=': return value >= target
    case '<=': return value <= target
    case '=': return value === target
    default: return false
  }
}

export class Screener {
  constructor(private ee: EvaluationEngine, private de: AshareEngine) {}

  async run(conditions: ScreenCondition[], scorecardName = '综合评估', topN = 20) {
    const list = await this.de.stockList()
    if (!list.success || !list.data) {
      return { totalScanned: 0, passed: 0, items: [] as never[] }
    }
    const universe = list.data.slice(0, 800)
    const card = createScorecard(scorecardName)
    const passed: ReturnType<EvaluationEngine['analyze']> extends Promise<infer S> ? S[] : never = []

    for (const item of universe) {
      const snap = await this.ee.analyze(item.code)
      const ok = conditions.every(c => passes(snap.factors[c.factor]?.value ?? null, c.op, c.value))
      if (ok) passed.push(snap)
      if (passed.length >= topN * 3) break
    }

    card.score(passed)
    passed.sort((a, b) => b.totalScore - a.totalScore)
    const top = passed.slice(0, topN)

    return {
      totalScanned: universe.length,
      passed: passed.length,
      scorecard: scorecardName,
      items: top.map(s => ({
        code: s.code,
        name: s.name,
        total_score: s.totalScore,
        key_factors: Object.fromEntries(
          conditions.map(c => [c.factor, s.factors[c.factor]?.value ?? null]),
        ),
      })),
    }
  }
}
