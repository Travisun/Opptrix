import { getProviderConfigStore } from '../config-store.js'

export interface BaostockRuntimeConfig {
  enabled: boolean
}

const DEFAULTS: BaostockRuntimeConfig = { enabled: true }

export function loadBaostockConfig(): BaostockRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('baostock')
    return { enabled: row.enabled }
  } catch {
    return { ...DEFAULTS }
  }
}

export function isBaostockEnabled(cfg = loadBaostockConfig()): boolean {
  return cfg.enabled
}
