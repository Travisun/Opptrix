import { tickflowSecretsOk } from '@opptrix/user-store'
import { getProviderConfigStore } from '../config-store.js'

export const TICKFLOW_DEFAULT_BASE_URL = 'https://api.tickflow.org'

export interface TickflowRuntimeConfig {
  enabled: boolean
  apiKey: string
  baseUrl: string
}

const DEFAULTS: TickflowRuntimeConfig = {
  enabled: false,
  apiKey: process.env.TICKFLOW_API_KEY ?? process.env.OPPTRIX_TICKFLOW_API_KEY ?? '',
  baseUrl: TICKFLOW_DEFAULT_BASE_URL,
}

export function loadTickflowConfig(): TickflowRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('tickflow')
    return {
      enabled: row.enabled,
      apiKey: String(row.extra.apiKey ?? DEFAULTS.apiKey).trim(),
      baseUrl: TICKFLOW_DEFAULT_BASE_URL,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function isTickflowEnabled(cfg = loadTickflowConfig()): boolean {
  return cfg.enabled && tickflowSecretsOk({ apiKey: cfg.apiKey }, DEFAULTS.apiKey)
}
