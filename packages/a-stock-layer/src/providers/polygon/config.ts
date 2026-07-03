import { polygonSecretsOk } from '@opptrix/user-store'
import { getProviderConfigStore } from '../config-store.js'

export interface PolygonRuntimeConfig {
  enabled: boolean
  apiKey: string
}

const DEFAULTS: PolygonRuntimeConfig = {
  enabled: false,
  apiKey: process.env.POLYGON_API_KEY ?? process.env.OPPTRIX_POLYGON_API_KEY ?? '',
}

export function loadPolygonConfig(): PolygonRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('polygon')
    return {
      enabled: row.enabled,
      apiKey: String(row.extra.apiKey ?? DEFAULTS.apiKey).trim(),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function isPolygonEnabled(cfg = loadPolygonConfig()): boolean {
  return cfg.enabled && polygonSecretsOk({ apiKey: cfg.apiKey }, DEFAULTS.apiKey)
}
