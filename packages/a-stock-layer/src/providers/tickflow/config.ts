/**
 * TickFlow Provider 运行时配置 — API Key 和基地址。
 *
 * 用途：初始化 TickFlow 客户端时读取配置。
 * 公开免费档：https://free-api.tickflow.org（无需 Key，对齐官方 TickFlow.free()）
 * 付费档：https://api.tickflow.org（配置 apiKey 后自动切换）
 * 存储：provider_settings JSON 文件中 extra.apiKey 字段
 * 环境变量：TICKFLOW_API_KEY / OPPTRIX_TICKFLOW_API_KEY；
 *           TICKFLOW_FREE_BASE_URL / TICKFLOW_BASE_URL 可覆盖基地址
 */

import { getProviderConfigStore } from '../config-store.js'
import {
  onTickflowConfigKey,
  syncTickflowPermissionConfig,
  type TickflowPermissionMode,
  type TickflowPlan,
} from './api/permissions.js'

/** TickFlow 公开免费 API 基地址（无需 Key） */
export const TICKFLOW_FREE_BASE_URL = 'https://free-api.tickflow.org'

/** TickFlow 付费 API 默认基地址（需 apiKey） */
export const TICKFLOW_DEFAULT_BASE_URL = 'https://api.tickflow.org'

/**
 * TickFlow 运行时配置 — 控制 Provider 启用状态和 API 认证。
 */
export interface TickflowRuntimeConfig {
  /** 是否启用 TickFlow Provider */
  enabled: boolean
  /** TickFlow API Key（可选；有 Key 则走付费端） */
  apiKey: string
  /** API 基地址：无 Key → 免费端；有 Key → 付费端 */
  baseUrl: string
  /** 权限适配：auto=403 自动屏蔽；manual=按套餐预设裁剪（仅有 Key 时有意义） */
  permissionMode: TickflowPermissionMode
  /** 手动档位：free=带 Key 免费套餐实测；paid=全量（付费 Key） */
  plan: TickflowPlan
}

const DEFAULTS: TickflowRuntimeConfig = {
  enabled: true,
  apiKey: process.env.TICKFLOW_API_KEY ?? process.env.OPPTRIX_TICKFLOW_API_KEY ?? '',
  baseUrl: TICKFLOW_FREE_BASE_URL,
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

function resolveBaseUrl(apiKey: string): string {
  if (apiKey) {
    const paid = process.env.TICKFLOW_BASE_URL?.trim()
    return paid || TICKFLOW_DEFAULT_BASE_URL
  }
  const free = process.env.TICKFLOW_FREE_BASE_URL?.trim()
  return free || TICKFLOW_FREE_BASE_URL
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
      baseUrl: resolveBaseUrl(apiKey),
      permissionMode,
      plan,
    }
  } catch {
    syncTickflowPermissionConfig(DEFAULTS.permissionMode, DEFAULTS.plan)
    const apiKey = DEFAULTS.apiKey.trim()
    return { ...DEFAULTS, apiKey, baseUrl: resolveBaseUrl(apiKey) }
  }
}

/** 公开免费档：未配置 apiKey（走 free-api，无需注册） */
export function isTickflowFreeTier(cfg = loadTickflowConfig()): boolean {
  return !cfg.apiKey.trim()
}

/** 仅依赖 enabled；公开免费档无需 Key */
export function isTickflowEnabled(cfg = loadTickflowConfig()): boolean {
  return cfg.enabled
}
