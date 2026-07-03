import { fmpSecretsOk } from '@opptrix/user-store'
import { getProviderConfigStore } from '../config-store.js'

export interface FmpRuntimeConfig {
  enabled: boolean
  apiKey: string
}

const DEFAULTS: FmpRuntimeConfig = {
  enabled: false,
  apiKey: process.env.FMP_API_KEY ?? process.env.OPPTRIX_FMP_API_KEY ?? '',
}

export function loadFmpConfig(): FmpRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('fmp')
    return {
      enabled: row.enabled,
      apiKey: String(row.extra.apiKey ?? DEFAULTS.apiKey).trim(),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function isFmpEnabled(cfg = loadFmpConfig()): boolean {
  return cfg.enabled && fmpSecretsOk({ apiKey: cfg.apiKey }, DEFAULTS.apiKey)
}
