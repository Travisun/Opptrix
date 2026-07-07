import { resolveUserDataRoot } from '@opptrix/shared'
import type { ProviderSettingsPatch, ProviderSettingsRow, ProviderBindingOverrideRow, ProviderBindingOverridePatch, ProviderSettingsField } from '@opptrix/shared'
import { computeEffectivePriority, getUserDataStore } from '@opptrix/user-store'
import path from 'node:path'
import { getProviderManifest } from './manifests.js'
import { notifyProviderConfigChanged } from './common/permission-denial.js'

function fieldKeyToEnvSuffix(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()
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
    const resolvedId = providerId === 'tdx' ? 'tdx' : providerId
    let existing = store.get(resolvedId)
    if (!existing && resolvedId === 'tdx') {
      existing = store.get('mootdx') ?? store.get('pytdx')
      if (existing) return { ...existing, providerId: 'tdx' }
    }
    if (existing) return existing
    const manifest = getProviderManifest(providerId)
    const enabledField = manifest?.settings?.fields.find(f => f.key === 'enabled')
    const enabledDefault = enabledField?.default === true
    return {
      providerId,
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
    const prev = this.getRuntime(providerId)
    const saved = getUserDataStore().providerSettings.save(providerId, patch)
    notifyProviderConfigChanged(providerId, prev, saved)
    return saved
  }

  secretsOk(providerId: string, runtime: ProviderSettingsRow): boolean {
    const manifest = getProviderManifest(providerId)
    const fields = manifest?.settings?.fields ?? []
    const requiredSecrets = fields.filter(f => f.type === 'secret' && f.required !== false)
    if (!requiredSecrets.length) return true

    for (const field of requiredSecrets) {
      if (!resolveSecretFieldValue(providerId, field, runtime.extra)) return false
    }
    return true
  }

  requiresSecrets(providerId: string): boolean {
    const manifest = getProviderManifest(providerId)
    const fields = manifest?.settings?.fields ?? []
    return fields.some(f => f.type === 'secret' && f.required !== false)
  }

  effectivePriority(providerId: string, manifestDefault?: number): number {
    const manifest = getProviderManifest(providerId)
    const defaultP = manifestDefault ?? manifest?.defaultPriority ?? 0
    const runtime = this.getRuntime(providerId)
    return computeEffectivePriority(
      providerId,
      defaultP,
      runtime,
      this.secretsOk(providerId, runtime),
    )
  }

  listBindingOverrides(providerId: string): ProviderBindingOverrideRow[] {
    return getUserDataStore().providerSettings.listBindingOverrides(providerId)
  }

  getBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
  ): ProviderBindingOverrideRow | null {
    return getUserDataStore().providerSettings.getBindingOverride(providerId, market, assetClass, capability)
  }

  saveBindingOverride(
    providerId: string,
    market: string,
    assetClass: string,
    capability: string,
    patch: ProviderBindingOverridePatch,
  ): ProviderBindingOverrideRow {
    return getUserDataStore().providerSettings.saveBindingOverride(
      providerId, market, assetClass, capability, patch,
    )
  }

  effectivePriorityForBinding(
    providerId: string,
    bindingDefaultPriority: number,
    market: string,
    assetClass: string,
    capability: string,
  ): number {
    const base = this.effectivePriority(providerId, bindingDefaultPriority)
    if (base <= 0) return 0
    const override = this.getBindingOverride(providerId, market, assetClass, capability)
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
