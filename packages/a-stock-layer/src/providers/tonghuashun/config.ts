import { getProviderConfigStore } from '../config-store.js'

export const FUYAO_BASE_URL = 'https://fuyao.aicubes.cn'

export interface TonghuashunRuntimeConfig {
  enabled: boolean
  apiKey: string
  baseUrl: string
}

const DEFAULTS: TonghuashunRuntimeConfig = {
  enabled: false,
  apiKey: process.env.FUYAO_TOKEN
    ?? process.env.OPPTRIX_FUYAO_API_KEY
    ?? process.env.OPPTRIX_TONGHUASHUN_API_KEY
    ?? '',
  baseUrl: FUYAO_BASE_URL,
}

export function loadTonghuashunConfig(): TonghuashunRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('tonghuashun')
    return {
      enabled: row.enabled,
      apiKey: String(row.extra.apiKey ?? DEFAULTS.apiKey).trim(),
      baseUrl: FUYAO_BASE_URL,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function isTonghuashunEnabled(cfg = loadTonghuashunConfig()): boolean {
  return cfg.enabled && !!cfg.apiKey.trim()
}
