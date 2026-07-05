import { getProviderConfigStore } from '../config-store.js'
import { DEFAULT_BASE_URL } from './api/constants.js'

/**
 * 自在量化 Provider 运行时配置 — Token、API 基地址、超时时间。
 *
 * 用途：初始化 ZzshareClient 时读取配置。
 * 存储：provider_settings JSON 文件中 extra.apiKey 字段
 * 环境变量：ZZSHARE_TOKEN / OPPTRIX_ZZSHARE_API_KEY（fallback）
 */
export interface ZzshareRuntimeConfig {
  /** 是否启用自在量化 Provider */
  enabled: boolean
  /** API Token（匿名模式为 "anonymous"） */
  token: string
  /** API 基地址，默认 https://api.zizizaizai.com */
  baseUrl: string
  /** 请求超时时间（毫秒），默认 10000 */
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
