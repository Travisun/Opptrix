import { Capability } from '../../core/capabilities.js'
import {
  CN_ETF_CAPABILITIES,
  cnEquityBindings,
  cnEtfBindings,
  cnIndexBindings,
  cryptoSpotBindings,
  usEquityBindings,
  regionalEquityBindings,
} from '../../core/bindings.js'

export function cnEquityEtfIndex(
  equityCaps: Capability[],
  indexCaps: Capability[],
  p: number,
  etfCaps: Capability[] = [Capability.STOCK_REALTIME, Capability.STOCK_KLINE],
  maxConcurrent?: number,
) {
  return [
    ...cnEquityBindings(equityCaps, p, maxConcurrent),
    ...cnEtfBindings(p, maxConcurrent).filter(b => etfCaps.includes(b.capability as Capability)),
    ...cnIndexBindings(indexCaps, p, maxConcurrent),
  ]
}

export function cnFullSplit(caps: Capability[], p: number, maxConcurrent?: number) {
  const etfSet = new Set<Capability>(CN_ETF_CAPABILITIES)
  const indexSet = new Set<Capability>([
    Capability.INDEX_REALTIME,
    Capability.INDEX_KLINE,
    Capability.INDEX_CONST,
  ])
  const equityCaps = caps.filter(c => !etfSet.has(c) && !indexSet.has(c))
  return [
    ...cnEquityBindings(equityCaps, p, maxConcurrent),
    ...cnEtfBindings(p, maxConcurrent),
    ...cnIndexBindings(caps.filter(c => indexSet.has(c)), p, maxConcurrent),
  ]
}

export {
  cnEquityBindings,
  cnEtfBindings,
  cnIndexBindings,
  usEquityBindings,
  cryptoSpotBindings,
  regionalEquityBindings,
}
