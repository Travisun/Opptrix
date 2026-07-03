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

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  return (trimmed || TICKFLOW_DEFAULT_BASE_URL).replace(/\/$/, '')
}

export function loadTickflowConfig(): TickflowRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('tickflow')
    return {
      enabled: row.enabled,
      apiKey: String(row.extra.apiKey ?? DEFAULTS.apiKey).trim(),
      baseUrl: normalizeBaseUrl(String(row.extra.baseUrl ?? DEFAULTS.baseUrl)),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function isTickflowEnabled(cfg = loadTickflowConfig()): boolean {
  return cfg.enabled && tickflowSecretsOk({ apiKey: cfg.apiKey }, DEFAULTS.apiKey)
}
