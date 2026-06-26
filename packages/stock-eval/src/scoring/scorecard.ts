import type { StockSnapshot } from '@ni-k/shared'
import { REGISTRY } from '../core/registry.js'
import { TEMPLATES } from './templates.js'

export interface ScorecardFactor {
  name: string
  weight: number
}

function percentileRank(values: (number | null)[], higherIsBetter: boolean): (number | null)[] {
  const indexed = values.map((v, i) => ({ v, i })).filter(x => x.v != null) as { v: number; i: number }[]
  if (indexed.length === 0) return values.map(() => null)
  indexed.sort((a, b) => a.v - b.v)
  const out: (number | null)[] = values.map(() => null)
  indexed.forEach((item, rank) => {
    const score = (rank / Math.max(indexed.length - 1, 1)) * 10
    out[item.i] = higherIsBetter ? score : 10 - score
  })
  return out
}

export function createScorecard(name: string) {
  const tpl = TEMPLATES[name] ?? TEMPLATES['综合评估']
  return {
    name,
    description: tpl.description,
    factors: tpl.factors,
    score(snapshots: StockSnapshot[]) {
      if (!snapshots.length) return snapshots
      for (const { name: fname } of tpl.factors) {
        const meta = REGISTRY.get(fname)?.meta
        const raw = snapshots.map(s => s.factors[fname]?.value ?? null)
        const normed = percentileRank(raw, meta?.higherIsBetter ?? true)
        snapshots.forEach((s, i) => {
          if (normed[i] != null) s.scores[`${fname}_score`] = normed[i]!
        })
      }
      for (const s of snapshots) {
        let total = 0, wsum = 0
        for (const { name: fname, weight } of tpl.factors) {
          const sc = s.scores[`${fname}_score`]
          if (sc != null) { total += sc * weight; wsum += weight }
        }
        s.totalScore = wsum > 0 ? Math.round((total / wsum) * 10) / 10 : 0
      }
      return snapshots
    },
  }
}

export function listTemplates() { return Object.keys(TEMPLATES) }
export { TEMPLATES, TEMPLATE_CATEGORIES } from './templates.js'
