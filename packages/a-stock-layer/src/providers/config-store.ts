import { resolveUserDataRoot } from '@opptrix/shared'
import type { ProviderSettingsPatch, ProviderSettingsRow, ProviderBindingOverrideRow, ProviderBindingOverridePatch, ProviderSettingsField } from '@opptrix/shared'
import { computeEffectivePriority, getUserDataStore } from '@opptrix/user-store'
import path from 'node:path'
import { getProviderManifest } from './manifests.js'
import { notifyProviderConfigChanged } from './common/permission-denial.js'
import { resolveProviderAlias } from './common/provider-aliases.js'

function fieldKeyToEnvSuffix(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()
}

/** 无需必填密钥的数据源默认启用；需 API Key 的默认关闭。 */
export function defaultProviderEnabled(providerId: string): boolean {
  const manifest = getProviderManifest(resolveProviderAlias(providerId))
  if (!manifest?.settings) return false
  const fields = manifest.settings.fields
  return !fields.some(f => f.type === 'secret' && f.required !== false)
}

function resolveSecretFieldValue(
  providerId: string,
  field: ProviderSettingsField,
  extra: Record<string, unknown>,
): string {
  const fromExtra = String(extra[field.key] ?? '').trim()
  if (fromExtra) return fromExtra

  const suffix = fieldKeyToEnvSuffix(field.key)
  const candidates = [
    `OPPTRIX_${providerId.toUpperCase()}_${suffix}`,
    `${providerId.toUpperCase()}_${suffix}`,
    `OPPTRIX_${providerId.toUpperCase()}_${field.key.toUpperCase()}`,
    `${providerId.toUpperCase()}_${field.key.toUpperCase()}`,
  ]
  for (const envKey of candidates) {
    const val = process.env[envKey]?.trim()
    if (val) return val
  }
  return ''
}

export class ProviderConfigStore {
  getRuntime(providerId: string): ProviderSettingsRow {
    const store = getUserDataStore().providerSettings
    const resolvedId = providerId === 'tdx' ? 'tdx' : resolveProviderAlias(providerId)
    let existing = store.get(resolvedId)
    if (!existing && resolvedId === 'tdx') {
      existing = store.get('mootdx') ?? store.get('pytdx')
      if (existing) return { ...existing, providerId: 'tdx' }
    }
    if (existing) {
      return providerId !== resolvedId ? { ...existing, providerId: resolvedId } : existing
    }
    const enabledDefault = defaultProviderEnabled(resolvedId)
    return {
      providerId: resolvedId,
      enabled: enabledDefault,
      priorityMode: 'manifest',
      priority: null,
      sortOrder: null,
      extra: {},
      updatedAt: '',
    }
  }

  listAll(): ProviderSettingsRow[] {
    return getUserDataStore().providerSettings.listAll()
  }

  save(providerId: string, patch: ProviderSettingsPatch): ProviderSettingsRow {
    const resolvedId = resolveProviderAlias(providerId)
    const prev = this.getRuntime(resolvedId)
    const saved = getUserDataStore().providerSettings.save(resolvedId, patch)
    notifyProviderConfigChanged(resolvedId, prev, saved)
    return saved
  }

  secretsOk(providerId: string, runtime: ProviderSettingsRow): boolean {
    const resolvedId = resolveProviderAlias(providerId)
    const manifest = getProviderManifest(resolvedId)
    const fields = manifest?.settings?.fields ?? []
    const requiredSecrets = fields.filter(f => f.type === 'secret' && f.required !== false)
    if (!requiredSecrets.length) return true

    for (const field of requiredSecrets) {
      if (!resolveSecretFieldValue(resolvedId, field, runtime.extra)) return false
    }
    return true
  }

  requiresSecrets(providerId: string): boolean {
    const manifest = getProviderManifest(resolveProviderAlias(providerId))
    const fields = manifest?.settings?.fields ?? []
    return fields.some(f => f.type === 'secret' && f.required !== false)
  }

  effectivePriority(providerId: string, manifestDefault?: number): number {
    const resolvedId = resolveProviderAlias(providerId)
    const manifest = getProviderManifest(resolvedId)
    const defaultP = manifestDefault ?? manifest?.defaultPriority ?? 0
    const runtime = this.getRuntime(resolvedId)
    return computeEffectivePriority(
      resolvedId,
      defaultP,
      runtime,
      this.secretsOk(resolvedId, runtime),
    )
  }

  listBindingOverrides(providerId: string): ProviderBindingOverrideRow[] {
    return getUserDataStore().providerSettings.listBindingOverrides(resolveProviderAlias(providerId))
  }

  getBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
  ): ProviderBindingOverrideRow | null {
    return getUserDataStore().providerSettings.getBindingOverride(
      resolveProviderAlias(providerId), market, assetClass, capability,
    )
  }

  saveBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
    patch: ProviderBindingOverridePatch,
  ): ProviderBindingOverrideRow {
    const resolvedId = resolveProviderAlias(providerId)
    return getUserDataStore().providerSettings.saveBindingOverride(
      resolvedId, market, assetClass, capability, patch,
    )
  }

  effectivePriorityForBinding(
    providerId: string,
    bindingDefaultPriority: number,
    market: string,
    assetClass: string,
    capability: string,
  ): number {
    const resolvedId = resolveProviderAlias(providerId)
    const base = this.effectivePriority(resolvedId, bindingDefaultPriority)
    if (base <= 0) return 0
    const override = this.getBindingOverride(resolvedId, market, assetClass, capability)
    if (override?.enabled === false) return 0
    if (override?.priority != null) return override.priority
    return base
  }

  configPath(): string {
    return path.join(resolveUserDataRoot(), 'opptrix.db')
  }
}

let sharedStore: ProviderConfigStore | null = null

export function getProviderConfigStore(): ProviderConfigStore {
  if (!sharedStore) sharedStore = new ProviderConfigStore()
  return sharedStore
}

export function resetProviderConfigStore(): void {
  sharedStore = null
}
