/** Local market data pack scope — user toggles optional packs in settings. */

import {
  PACK_REGISTRY,
  buildDefaultMarketPackConfig,
  normalizeMarketDataPackConfig,
  type MarketDataPackConfig as PackConfigRecord,
} from './pack-registry.js'

export type MarketDataPackId = 'cn' | 'us' | 'crypto' | 'hk' | 'jp' | 'kr'

export interface MarketDataPackEntry {
  enabled: boolean
  /** ISO timestamp when pack was last prepared (sync completed) */
  prepared_at?: string | null
}

export type MarketDataPackConfig = PackConfigRecord

export const MARKET_DATA_PACK_PREF_KEY = 'market_data_packs'

export const DEFAULT_MARKET_DATA_PACK_CONFIG: MarketDataPackConfig = buildDefaultMarketPackConfig()

export const MARKET_PACK_LABELS: Record<MarketDataPackId, string> = Object.fromEntries(
  PACK_REGISTRY.map(p => [p.id, p.label]),
) as Record<MarketDataPackId, string>

export const MARKET_PACK_DESCRIPTIONS: Record<MarketDataPackId, string> = Object.fromEntries(
  PACK_REGISTRY.map(p => [p.id, p.description]),
) as Record<MarketDataPackId, string>

export * from './pack-registry.js'
