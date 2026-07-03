import { getUserDataStore } from '@opptrix/user-store'
import {
  DEFAULT_MARKET_DATA_PACK_CONFIG,
  MARKET_DATA_PACK_PREF_KEY,
  type MarketDataPackConfig,
  type MarketDataPackId,
} from '@opptrix/shared'

function normalizeEntry(
  raw: Partial<{ enabled?: boolean; prepared_at?: string | null }> | undefined,
  fallbackEnabled: boolean,
) {
  return {
    enabled: raw?.enabled ?? fallbackEnabled,
    prepared_at: raw?.prepared_at ?? null,
  }
}

export function normalizeMarketPackConfig(raw: unknown): MarketDataPackConfig {
  const r = (raw && typeof raw === 'object') ? raw as Partial<MarketDataPackConfig> : {}
  return {
    cn: { enabled: true, prepared_at: normalizeEntry(r.cn, true).prepared_at },
    us: normalizeEntry(r.us, DEFAULT_MARKET_DATA_PACK_CONFIG.us.enabled),
    crypto: normalizeEntry(r.crypto, DEFAULT_MARKET_DATA_PACK_CONFIG.crypto.enabled),
  }
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
  const next: MarketDataPackConfig = {
    cn: { ...current.cn, enabled: true },
    us: { ...current.us, ...patch.us },
    crypto: { ...current.crypto, ...patch.crypto },
  }
  return saveMarketPackConfig(next)
}

export function markMarketPackPrepared(pack: MarketDataPackId): MarketDataPackConfig {
  if (pack === 'cn') return loadMarketPackConfig()
  return patchMarketPackConfig({
    [pack]: { enabled: true, prepared_at: new Date().toISOString() },
  })
}
