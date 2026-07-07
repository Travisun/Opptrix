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
import {
  onTickflowConfigKey,
  syncTickflowPermissionConfig,
  type TickflowPermissionMode,
  type TickflowPlan,
} from './api/permissions.js'

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
  /** 权限适配：auto=403 自动屏蔽；manual=按套餐预设裁剪 */
  permissionMode: TickflowPermissionMode
  /** 手动档位：free=免费版实测接口；paid=全量（付费 Key） */
  plan: TickflowPlan
}

const DEFAULTS: TickflowRuntimeConfig = {
  enabled: false,
  apiKey: process.env.TICKFLOW_API_KEY ?? process.env.OPPTRIX_TICKFLOW_API_KEY ?? '',
  baseUrl: TICKFLOW_DEFAULT_BASE_URL,
  permissionMode: 'auto',
  plan: 'free',
}

function parsePermissionMode(v: unknown): TickflowPermissionMode {
  return v === 'manual' ? 'manual' : 'auto'
}

function parsePlan(v: unknown): TickflowPlan {
  const s = String(v ?? '').trim()
  if (s === 'paid' || s === 'full' || s === 'standard' || s === 'premium') return 'paid'
  return 'free'
}

export function loadTickflowConfig(): TickflowRuntimeConfig {
  try {
    const row = getProviderConfigStore().getRuntime('tickflow')
    const apiKey = String(row.extra.apiKey ?? DEFAULTS.apiKey).trim()
    onTickflowConfigKey(apiKey)
    const permissionMode = parsePermissionMode(row.extra.permissionMode)
    const plan = parsePlan(row.extra.plan ?? row.extra.planTier)
    syncTickflowPermissionConfig(permissionMode, plan)
    return {
      enabled: row.enabled,
      apiKey,
      baseUrl: TICKFLOW_DEFAULT_BASE_URL,
      permissionMode,
      plan,
    }
  } catch {
    syncTickflowPermissionConfig(DEFAULTS.permissionMode, DEFAULTS.plan)
    return { ...DEFAULTS }
  }
}

export function isTickflowEnabled(cfg = loadTickflowConfig()): boolean {
  return cfg.enabled && tickflowSecretsOk({ apiKey: cfg.apiKey }, DEFAULTS.apiKey)
}
