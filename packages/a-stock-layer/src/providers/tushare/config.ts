import { tushareSecretsOk } from '@opptrix/user-store'
import { resolveUserDataRoot } from '@opptrix/shared'
import path from 'node:path'
import { getProviderConfigStore } from '../config-store.js'

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

function runtimeFromStore(): TushareRuntimeConfig {
  const row = getProviderConfigStore().getRuntime('tushare')
  return {
    enabled: row.enabled,
    token: String(row.extra.token ?? DEFAULTS.token).trim(),
  }
}

export function loadTushareConfig(): TushareRuntimeConfig {
  try {
    return runtimeFromStore()
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveTushareConfig(partial: Partial<TushareRuntimeConfig>): TushareRuntimeConfig {
  const current = loadTushareConfig()
  const next: TushareRuntimeConfig = {
    enabled: partial.enabled ?? current.enabled,
    token: partial.token !== undefined ? String(partial.token).trim() : current.token,
  }
  getProviderConfigStore().save('tushare', {
    enabled: next.enabled,
    extra: { token: next.token },
  })
  return next
}

export function isTushareEnabled(cfg = loadTushareConfig()): boolean {
  return cfg.enabled && tushareSecretsOk({ token: cfg.token }, process.env.TUSHARE_TOKEN ?? '')
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
