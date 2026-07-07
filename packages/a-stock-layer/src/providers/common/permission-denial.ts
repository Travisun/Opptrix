import type { Capability } from '../../core/capabilities.js'
import type { ProviderBinding } from '@opptrix/shared'
import type { ProviderSettingsRow } from '@opptrix/shared'
import { getProviderManifest } from '../manifests.js'

/**
 * Provider 接口权限拒绝登记 — 运行时遇「权限不足」后永久屏蔽，直至：
 * - 重新启用 Provider（disabled → enabled）
 * - 更换 API Key / 密钥类配置
 * - 手动 reset
 */
export type PermissionFeatureKey = string

type DenialEntry = {
  reason: string
  at: number
}

const denied = new Map<string, DenialEntry>()

function makeKey(providerId: string, feature: PermissionFeatureKey): string {
  return `${providerId}::${feature}`
}

export function isPermissionDeniedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  if (/\b403\b/.test(msg)) return true
  if (/NO_[A-Z0-9_]+_PERMISSION/.test(msg)) return true
  if (/订阅|无权限|权限不足|permission denied|not authorized|insufficient privilege|积分不足|无接口访问权限/i.test(msg)) {
    return true
  }
  return false
}

export function recordProviderPermissionDenial(
  providerId: string,
  feature: PermissionFeatureKey,
  reason = '',
): void {
  denied.set(makeKey(providerId, feature), {
    reason: reason.slice(0, 200),
    at: Date.now(),
  })
}

export function isProviderFeatureDenied(
  providerId: string,
  feature: PermissionFeatureKey,
): boolean {
  return denied.has(makeKey(providerId, feature))
}

export function isProviderCapabilityDenied(
  providerId: string,
  capability: Capability | string,
): boolean {
  return isProviderFeatureDenied(providerId, String(capability))
}

export function getProviderDeniedFeatures(providerId: string): string[] {
  const prefix = `${providerId}::`
  const out: string[] = []
  for (const key of denied.keys()) {
    if (key.startsWith(prefix)) out.push(key.slice(prefix.length))
  }
  return out
}

export function getProviderPermissionDenialSnapshot(): Record<string, DenialEntry> {
  const snap: Record<string, DenialEntry> = {}
  for (const [k, v] of denied) snap[k] = { ...v }
  return snap
}

export function clearProviderPermissionDenials(providerId: string): void {
  const prefix = `${providerId}::`
  for (const key of [...denied.keys()]) {
    if (key.startsWith(prefix)) denied.delete(key)
  }
}

export function clearAllProviderPermissionDenials(): void {
  denied.clear()
}

function secretFieldKeys(providerId: string): string[] {
  const manifest = getProviderManifest(providerId)
  return (manifest?.settings?.fields ?? [])
    .filter(f => f.type === 'secret')
    .map(f => f.key)
}

export function notifyProviderConfigChanged(
  providerId: string,
  prev: ProviderSettingsRow,
  next: ProviderSettingsRow,
): void {
  const reEnabled = !prev.enabled && next.enabled
  if (reEnabled) {
    clearProviderPermissionDenials(providerId)
    return
  }
  for (const key of secretFieldKeys(providerId)) {
    const a = String(prev.extra[key] ?? '').trim()
    const b = String(next.extra[key] ?? '').trim()
    if (a !== b) {
      clearProviderPermissionDenials(providerId)
      return
    }
  }
}

export function filterCapabilitiesByPermission(
  providerId: string,
  capabilities: Capability[],
): Capability[] {
  if (!getProviderDeniedFeatures(providerId).length) return capabilities
  return capabilities.filter(c => !isProviderCapabilityDenied(providerId, c))
}

export function filterBindingsByPermission(
  providerId: string,
  bindings: ProviderBinding[],
): ProviderBinding[] {
  if (!getProviderDeniedFeatures(providerId).length) return bindings
  return bindings.filter(b => !isProviderCapabilityDenied(providerId, b.capability))
}
