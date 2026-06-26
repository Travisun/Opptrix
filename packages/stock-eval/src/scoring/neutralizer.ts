import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import type { StockSnapshot } from '@inno-a-stock/shared'
import { REGISTRY } from '../core/registry.js'

type Snap = StockSnapshot & { industry?: string }

/** Industry-relative percentile scoring (mirrors Python IndustryNeutralizer) */
export class IndustryNeutralizer {
  constructor(
    private de?: AshareEngine,
    private minIndustrySize = 5,
  ) {}

  async compute(snapshots: Snap[], factorNames?: string[]) {
    const names = factorNames ?? REGISTRY.list()
    await this.assignIndustries(snapshots)
    const groups = new Map<string, Snap[]>()
    for (const s of snapshots) {
      const ind = s.industry ?? '未知'
      if (!groups.has(ind)) groups.set(ind, [])
      groups.get(ind)!.push(s)
    }
    for (const [, members] of groups) {
      if (members.length < this.minIndustrySize) {
        for (const s of members) {
          for (const fn of names) {
            const v = s.factors[fn]?.value
            if (v != null) s.scores[`${fn}_industry_score`] = 5
          }
        }
        continue
      }
      for (const fn of names) {
        const meta = REGISTRY.get(fn)?.meta
        const vals = members.map(s => s.factors[fn]?.value ?? null)
        const ranked = vals
          .map((v, i) => ({ v, i }))
          .filter(x => x.v != null)
          .sort((a, b) => (a.v! - b.v!))
        ranked.forEach((item, rank) => {
          const score = (rank / Math.max(ranked.length - 1, 1)) * 10
          const adj = meta?.higherIsBetter !== false ? score : 10 - score
          members[item.i].scores[`${fn}_industry_score`] = Math.round(adj * 10) / 10
        })
      }
    }
    return snapshots
  }

  private async assignIndustries(snapshots: Snap[]) {
    if (!this.de) return
    const list = await this.de.stockList()
    const byCode = new Map((list.data ?? []).map(s => [s.code, s.industry]))
    for (const s of snapshots) {
      if (!s.industry) s.industry = byCode.get(s.code) ?? '未知'
    }
  }
}
