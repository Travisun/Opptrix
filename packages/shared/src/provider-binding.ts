import type { AssetClass, Market } from './market-data.js'

/** Provider capability binding — DATA-LAYER §6 */
export interface ProviderBinding {
  market: Market
  assetClass: AssetClass
  capability: string
  defaultPriority: number
}
