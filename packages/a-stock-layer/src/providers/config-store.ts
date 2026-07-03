import { resolveUserDataRoot } from '@opptrix/shared'
import type { ProviderSettingsPatch, ProviderSettingsRow, ProviderBindingOverrideRow, ProviderBindingOverridePatch } from '@opptrix/shared'
import {
  computeEffectivePriority,
  getUserDataStore,
  polygonSecretsOk,
  fmpSecretsOk,
  tiingoSecretsOk,
  tushareSecretsOk,
} from '@opptrix/user-store'
import path from 'node:path'
import { getProviderManifest } from './manifests.js'

const TUSHARE_ENV_TOKEN = process.env.TUSHARE_TOKEN ?? ''
const POLYGON_ENV_KEY = process.env.POLYGON_API_KEY ?? process.env.OPPTRIX_POLYGON_API_KEY ?? ''
const FMP_ENV_KEY = process.env.FMP_API_KEY ?? process.env.OPPTRIX_FMP_API_KEY ?? ''
const TIINGO_ENV_TOKEN = process.env.TIINGO_API_TOKEN ?? process.env.OPPTRIX_TIINGO_API_TOKEN ?? ''

const SECRET_REQUIRED = new Set(['tushare', 'polygon', 'tiingo', 'fmp'])

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
    return getUserDataStore().providerSettings.save(providerId, patch)
  }

  secretsOk(providerId: string, runtime: ProviderSettingsRow): boolean {
    if (providerId === 'tushare') {
      return tushareSecretsOk(runtime.extra, TUSHARE_ENV_TOKEN)
    }
    if (providerId === 'polygon') {
      return polygonSecretsOk(runtime.extra, POLYGON_ENV_KEY)
    }
    if (providerId === 'tiingo') {
      return tiingoSecretsOk(runtime.extra, TIINGO_ENV_TOKEN)
    }
    if (providerId === 'fmp') {
      return fmpSecretsOk(runtime.extra, FMP_ENV_KEY)
    }
    return true
  }

  requiresSecrets(providerId: string): boolean {
    return SECRET_REQUIRED.has(providerId)
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
