import type { AssetClass, Market } from './market-data.js'

/** Provider capability binding — DATA-LAYER §6 */
export interface ProviderBinding {
  market: Market
  assetClass: AssetClass
  capability: string
  defaultPriority: number
  /** 该 provider 最大并发请求数（负载均衡硬限制） */
  maxConcurrent?: number
}
