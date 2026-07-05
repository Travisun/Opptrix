/**
 * TickFlow Provider 运行时配置 — API Key 和基地址。
 *
 * 用途：初始化 TickFlow 客户端时读取配置。
 * 数据源：TickFlow API https://api.tickflow.org
 * 存储：provider_settings JSON 文件中 extra.apiKey 字段
 * 环境变量：TICKFLOW_API_KEY / OPPTRIX_TICKFLOW_API_KEY
 */

import { tickflowSecretsOk } from '@opptrix/user-store'
import { getProviderConfigStore } from '../config-store.js'

/** TickFlow API 默认基地址 */
export const TICKFLOW_DEFAULT_BASE_URL = 'https://api.tickflow.org'

/**
 * TickFlow 运行时配置 — 控制 Provider 启用状态和 API 认证。
 */
export interface TickflowRuntimeConfig {
  /** 是否启用 TickFlow Provider */
  enabled: boolean
  /** TickFlow API Key（付费接口，需在 tickflow.com 申请） */
  apiKey: string
  /** API 基地址，默认 https://api.tickflow.org */
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
