import { getUserDataStore } from '@opptrix/user-store'
import {
  MARKET_DATA_PACK_PREF_KEY,
  normalizeMarketDataPackConfig,
  type MarketDataPackConfig,
  type MarketDataPackId,
} from '@opptrix/shared'

export function normalizeMarketPackConfig(raw: unknown): MarketDataPackConfig {
  return normalizeMarketDataPackConfig(raw)
}

export function loadMarketPackConfig(): MarketDataPackConfig {
  const raw = getUserDataStore().getDocument<MarketDataPackConfig>(
    'preference',
    MARKET_DATA_PACK_PREF_KEY,
  )
  return normalizeMarketPackConfig(raw)
}

export function saveMarketPackConfig(config: MarketDataPackConfig): MarketDataPackConfig {
  const normalized = normalizeMarketPackConfig(config)
  getUserDataStore().setDocument('preference', MARKET_DATA_PACK_PREF_KEY, normalized)
  return normalized
}

export function patchMarketPackConfig(
  patch: Partial<Record<MarketDataPackId, Partial<{ enabled: boolean; prepared_at?: string | null }>>>,
): MarketDataPackConfig {
  const current = loadMarketPackConfig()
  const next = { ...current, cn: { ...current.cn, enabled: true } } as MarketDataPackConfig
  for (const [pack, entry] of Object.entries(patch) as [MarketDataPackId, Partial<{ enabled: boolean; prepared_at?: string | null }>][]) {
    if (pack === 'cn' || !entry) continue
    next[pack] = { ...current[pack], ...entry }
  }
  return saveMarketPackConfig(next)
}

export function markMarketPackPrepared(pack: MarketDataPackId): MarketDataPackConfig {
  if (pack === 'cn') return loadMarketPackConfig()
  return patchMarketPackConfig({
    [pack]: { enabled: true, prepared_at: new Date().toISOString() },
  })
}
