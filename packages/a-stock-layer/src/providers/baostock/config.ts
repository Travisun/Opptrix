import { getProviderConfigStore } from '../config-store.js'

/**
 * BaoStock Provider 运行时配置 — 仅启用/禁用开关。
 *
 * 用途：控制 BaoStock 数据源是否参与查询。
 * 特点：BaoStock 为免费开源数据源，无需 API Key。
 */
export interface BaostockRuntimeConfig {
  /** 是否启用 BaoStock Provider */
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
