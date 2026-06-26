import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import type { FactorMeta, FactorResult } from '@inno-a-stock/shared'

export type FactorCompute = (engine: AshareEngine, code: string) => Promise<FactorResult | null>

export interface RegisteredFactor {
  meta: FactorMeta
  compute: FactorCompute
}

class FactorRegistry {
  private factors = new Map<string, RegisteredFactor>()

  register(meta: FactorMeta, compute: FactorCompute) {
    this.factors.set(meta.name, { meta, compute })
  }

  get(name: string) { return this.factors.get(name) }
  list(category?: string) {
    return [...this.factors.values()]
      .filter(f => !category || f.meta.category === category)
      .map(f => f.meta.name)
  }
  metas() { return [...this.factors.values()].map(f => f.meta) }
  count() { return this.factors.size }
}

export const REGISTRY = new FactorRegistry()

export function registerFactor(meta: FactorMeta, compute: FactorCompute) {
  REGISTRY.register(meta, compute)
}
