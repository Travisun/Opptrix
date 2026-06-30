import { getUserDataStore } from '@opptrix/user-store'
import { resolveUserDataRoot } from '@opptrix/shared'
import path from 'node:path'

const NAMESPACE = 'tushare_config'
const DOC_ID = 'default'

export interface TushareRuntimeConfig {
  enabled: boolean
  token: string
}

export interface PublicTushareConfig {
  enabled: boolean
  token: string
  token_configured: boolean
  token_preview: string
  config_path: string
}

const DEFAULTS: TushareRuntimeConfig = {
  enabled: false,
  token: process.env.TUSHARE_TOKEN ?? '',
}

export function tushareConfigPath(): string {
  return path.join(resolveUserDataRoot(), 'opptrix.db')
}

export function loadTushareConfig(): TushareRuntimeConfig {
  try {
    const raw = getUserDataStore().getDocument<Partial<TushareRuntimeConfig>>(NAMESPACE, DOC_ID)
    if (raw) {
      return {
        enabled: raw.enabled ?? DEFAULTS.enabled,
        token: String(raw.token ?? DEFAULTS.token).trim(),
      }
    }
  } catch { /* defaults */ }
  return { ...DEFAULTS }
}

export function saveTushareConfig(partial: Partial<TushareRuntimeConfig>): TushareRuntimeConfig {
  const current = loadTushareConfig()
  const next: TushareRuntimeConfig = {
    enabled: partial.enabled ?? current.enabled,
    token: partial.token !== undefined ? String(partial.token).trim() : current.token,
  }
  getUserDataStore().setDocument(NAMESPACE, DOC_ID, next)
  return next
}

export function isTushareEnabled(cfg = loadTushareConfig()): boolean {
  return cfg.enabled && !!cfg.token
}

export function publicTushareConfig(cfg = loadTushareConfig()): PublicTushareConfig {
  const token = cfg.token
  return {
    enabled: cfg.enabled,
    token,
    token_configured: !!token,
    token_preview: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : '',
    config_path: tushareConfigPath(),
  }
}
