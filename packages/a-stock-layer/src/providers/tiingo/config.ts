import { tiingoSecretsOk } from '@opptrix/user-store'
import { getProviderConfigStore } from '../config-store.js'

export interface TiingoRuntimeConfig {
  enabled: boolean
  apiToken: string
}

const DEFAULTS: TiingoRuntimeConfig = {
  enabled: false,
  apiToken: process.env.TIINGO_API_TOKEN ?? process.env.OPPTRIX_TIINGO_API_TOKEN ?? '',
}

export function loadTiingoConfig(): TiingoRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('tiingo')
    return {
      enabled: row.enabled,
      apiToken: String(row.extra.apiToken ?? DEFAULTS.apiToken).trim(),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function isTiingoEnabled(cfg = loadTiingoConfig()): boolean {
  return cfg.enabled && tiingoSecretsOk({ apiToken: cfg.apiToken }, DEFAULTS.apiToken)
}
