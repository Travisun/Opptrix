/** Provider runtime config — persisted in user-store provider_settings (DATA-LAYER §7.7) */

import type { MarketGroup } from './market-data.js'

export type ProviderPriorityMode = 'manifest' | 'custom'

export type ProviderSettingsFieldType = 'boolean' | 'string' | 'secret' | 'number' | 'select'

export interface ProviderSettingsField {
  key: string
  type: ProviderSettingsFieldType
  label: string
  description?: string
  placeholder?: string
  required?: boolean
  default?: unknown
  options?: Array<{ value: string; label: string }>
  masked?: boolean
}

export interface ProviderSettingsDefinition {
  providerId: string
  title: string
  subtitle?: string
  marketGroup: MarketGroup
  keywords?: string[]
  fields: ProviderSettingsField[]
  supportsTest?: boolean
  enableAffectsPriority?: boolean
}

export interface ProviderSettingsRow {
  providerId: string
  enabled: boolean
  priorityMode: ProviderPriorityMode
  priority: number | null
  sortOrder: number | null
  extra: Record<string, unknown>
  updatedAt: string
}

export interface ProviderSettingsPatch {
  enabled?: boolean
  priorityMode?: ProviderPriorityMode
  priority?: number | null
  sortOrder?: number | null
  extra?: Record<string, unknown>
}

export interface ProviderManifest {
  providerId: string
  title: string
  subtitle?: string
  marketGroup: MarketGroup
  defaultPriority: number
  keywords?: string[]
  /** Built-in settings schema; empty = ops-only card (enable/priority) */
  settings?: ProviderSettingsDefinition
}

export interface PublicProviderRuntime {
  providerId: string
  title: string
  subtitle?: string
  marketGroup: MarketGroup
  enabled: boolean
  priorityMode: ProviderPriorityMode
  priority: number | null
  effectivePriority: number
  manifestDefaultPriority: number
  secretsConfigured: Record<string, boolean>
  /** Masked preview for configured secrets, e.g. abcd…wxyz */
  secretPreviews?: Record<string, string>
  canEnable: boolean
  values: Record<string, unknown>
  settingsFields: ProviderSettingsField[]
  supportsTest: boolean
  capabilities: string[]
  updatedAt?: string
}

export interface ProviderCatalogGroup {
  marketGroup: MarketGroup
  label: string
  providers: PublicProviderRuntime[]
}

export interface ProviderCatalogResponse {
  groups: ProviderCatalogGroup[]
}

/** Per (market × assetClass × capability) priority override — DATA-LAYER §7.7.3 */
export interface ProviderBindingOverrideRow {
  providerId: string
  market: import('./market-data.js').Market
  assetClass: import('./market-data.js').AssetClass
  capability: string
  enabled: boolean | null
  priority: number | null
  updatedAt: string
}

export interface ProviderBindingOverridePatch {
  enabled?: boolean | null
  priority?: number | null
}

export interface PublicProviderBindingOverride {
  market: import('./market-data.js').Market
  assetClass: import('./market-data.js').AssetClass
  capability: string
  label: string
  manifestDefaultPriority: number
  overrideEnabled: boolean | null
  overridePriority: number | null
  effectivePriority: number
}

/** @deprecated Use PublicProviderRuntime — kept for Tushare REST compat */
export interface TusharePublicConfigLegacy {
  enabled: boolean
  token: string
  token_configured: boolean
  token_preview: string
  config_path: string
}
