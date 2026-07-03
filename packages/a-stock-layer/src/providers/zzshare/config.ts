import { getProviderConfigStore } from '../config-store.js'
import { DEFAULT_BASE_URL } from './api/constants.js'

export interface ZzshareRuntimeConfig {
  enabled: boolean
  token: string
  baseUrl: string
  timeoutMs: number
}

const DEFAULT_TOKEN =
  process.env.ZZSHARE_TOKEN?.trim()
  || process.env.OPPTRIX_ZZSHARE_API_KEY?.trim()
  || 'anonymous'

const DEFAULTS: ZzshareRuntimeConfig = {
  enabled: true,
  token: DEFAULT_TOKEN,
  baseUrl: DEFAULT_BASE_URL,
  timeoutMs: 10_000,
}

export function loadZzshareConfig(): ZzshareRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('zzshare')
    const fromExtra = String(row.extra.apiKey ?? '').trim()
    const token = fromExtra || DEFAULT_TOKEN
    return {
      enabled: row.enabled,
      token,
      baseUrl: DEFAULT_BASE_URL,
      timeoutMs: DEFAULTS.timeoutMs,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Enabled flag only — token defaults to `anonymous` when unset. */
export function isZzshareEnabled(cfg = loadZzshareConfig()): boolean {
  return cfg.enabled
}

/** True when a non-anonymous token is configured (enables rt_k realtime). */
export function hasZzshareToken(cfg = loadZzshareConfig()): boolean {
  const token = cfg.token.trim()
  return token.length > 0 && token !== 'anonymous'
}
