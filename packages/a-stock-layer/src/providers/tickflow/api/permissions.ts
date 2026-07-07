import { Capability } from '../../../core/capabilities.js'
import { TICKFLOW_CAPS } from '../manifest.js'
import {
  clearProviderPermissionDenials,
  filterCapabilitiesByPermission,
  isProviderFeatureDenied,
  recordProviderPermissionDenial,
} from '../../common/permission-denial.js'

/** 权限适配：自动根据 403 登记屏蔽，或手动选免费/付费预设 */
export type TickflowPermissionMode = 'auto' | 'manual'

/** 手动档位：免费版 / 付费版（实测划分） */
export type TickflowPlan = 'free' | 'paid'

/** TickFlow 403 错误码 → 内部功能键 */
export const TICKFLOW_ERROR_TO_FEATURE: Record<string, string> = {
  NO_DEPTH_PERMISSION: 'depth',
  NO_INTRADAY_PERMISSION: 'intraday',
  NO_INTRADAY_BATCH_PERMISSION: 'intraday_batch',
  NO_KLINE_BATCH_PERMISSION: 'kline_batch',
  NO_EX_FACTORS_PERMISSION: 'ex_factors',
  NO_FINANCIAL_PERMISSION: 'financial',
}

const INTRADAY_CAPS = [Capability.INTRADAY_TICK] as const

const FINANCIAL_CAPS = [
  Capability.FINANCIAL_SUMMARY,
  Capability.BALANCE_SHEET,
  Capability.INCOME_STMT,
  Capability.CASH_FLOW,
  Capability.SHAREHOLDER,
] as const

/** 免费版标准 Capability（实测 10 个 OpenAPI path 对应） */
export const TICKFLOW_FREE_CAPS = TICKFLOW_CAPS.filter(
  c => !INTRADAY_CAPS.includes(c as typeof INTRADAY_CAPS[number])
    && !FINANCIAL_CAPS.includes(c as typeof FINANCIAL_CAPS[number]),
)

/** 付费扩展功能键（非标准 Capability） */
export const TICKFLOW_PAID_FEATURES = new Set([
  'depth',
  'intraday',
  'intraday_batch',
  'kline_batch',
  'ex_factors',
  'financial',
])

/**
 * 免费版可访问的 OpenAPI path（`npm run test:tickflow` 实测）。
 */
export const TICKFLOW_FREE_API_PATHS = [
  'GET /v1/exchanges',
  'GET /v1/quotes',
  'POST /v1/quotes',
  'GET /v1/klines',
  'GET /v1/instruments',
  'POST /v1/instruments',
  'GET /v1/exchanges/{exchange}/instruments',
  'GET /v1/universes',
  'GET /v1/universes/{id}',
  'POST /v1/universes/batch',
] as const

/** 付费接口 path */
export const TICKFLOW_PAID_API_PATHS = [
  'GET /v1/depth',
  'GET /v1/depth/batch',
  'GET /v1/klines/batch',
  'GET /v1/klines/intraday',
  'GET /v1/klines/intraday/batch',
  'GET /v1/klines/ex-factors',
  'GET /v1/financials/income',
  'GET /v1/financials/balance-sheet',
  'GET /v1/financials/cash-flow',
  'GET /v1/financials/metrics',
  'GET /v1/financials/shares',
] as const

const FEATURE_BLOCKED_CAPS: Record<string, Capability[]> = {
  intraday: [...INTRADAY_CAPS],
  intraday_batch: [...INTRADAY_CAPS],
  financial: [...FINANCIAL_CAPS],
}

let cachedApiKey = ''
let cachedPermissionMode: TickflowPermissionMode = 'auto'
let cachedPlan: TickflowPlan = 'free'
let probeCompleted = false

export function syncTickflowPermissionConfig(
  mode: TickflowPermissionMode,
  plan: TickflowPlan,
): void {
  cachedPermissionMode = mode
  cachedPlan = plan
}

export function onTickflowConfigKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (trimmed && trimmed !== cachedApiKey) {
    cachedApiKey = trimmed
    clearProviderPermissionDenials('tickflow')
  }
}

export function recordTickflowPermissionDenial(message?: string, code?: string): void {
  const fromCode = code ? TICKFLOW_ERROR_TO_FEATURE[code] : undefined
  const feature = fromCode ?? parseTickflowPermissionCode(message ?? '')
  if (!feature) return
  recordProviderPermissionDenial('tickflow', feature, message ?? code ?? '')
  for (const cap of FEATURE_BLOCKED_CAPS[feature] ?? []) {
    recordProviderPermissionDenial('tickflow', cap, message ?? code ?? '')
  }
}

export function parseTickflowPermissionCode(text: string): string | null {
  const match = text.match(/\(([A-Z0-9_]+)\)\s*$/) ?? text.match(/\b(NO_[A-Z0-9_]+)\b/)
  const code = match?.[1]
  return code ? (TICKFLOW_ERROR_TO_FEATURE[code] ?? null) : null
}

export function markTickflowPermissionProbeComplete(): void {
  probeCompleted = true
}

export function isTickflowPermissionProbeComplete(): boolean {
  return probeCompleted
}

export function isTickflowFeatureAllowed(feature: string): boolean {
  if (cachedPermissionMode === 'manual') {
    if (cachedPlan === 'paid') return true
    return !TICKFLOW_PAID_FEATURES.has(feature)
  }
  return !isProviderFeatureDenied('tickflow', feature)
}

export function getTickflowDeniedFeatures(): string[] {
  return [...TICKFLOW_PAID_FEATURES].filter(f => isProviderFeatureDenied('tickflow', f))
}

/**
 * 解析当前应注册的 TickFlow Capability。
 */
export function resolveTickflowEffectiveCapabilities(
  mode: TickflowPermissionMode = 'auto',
  plan: TickflowPlan = 'free',
): Capability[] {
  const base = mode === 'manual' && plan === 'paid'
    ? [...TICKFLOW_CAPS]
    : mode === 'manual'
      ? [...TICKFLOW_FREE_CAPS]
      : [...TICKFLOW_CAPS]
  return filterCapabilitiesByPermission('tickflow', base)
}
