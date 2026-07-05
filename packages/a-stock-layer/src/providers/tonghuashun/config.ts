import { getProviderConfigStore } from '../config-store.js'

export const FUYAO_BASE_URL = 'https://fuyao.aicubes.cn'

/**
 * 同花顺（富耀）Provider 运行时配置 — API Key 和基地址。
 *
 * 用途：初始化同花顺 Provider 客户端时读取配置。
 * 存储：provider_settings JSON 文件中 extra.apiKey 字段
 * 环境变量：FUYAO_TOKEN / OPPTRIX_FUYAO_API_KEY / OPPTRIX_TONGHUASHUN_API_KEY
 */
export interface TonghuashunRuntimeConfig {
  /** 是否启用同花顺 Provider */
  enabled: boolean
  /** 富耀 API Key（需付费申请） */
  apiKey: string
  /** API 基地址，默认 https://fuyao.aicubes.cn */
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
