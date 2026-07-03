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

export interface PublicProviderRuntime {
  providerId: string
  title: string
  subtitle?: string
  marketGroup: string
  enabled: boolean
  priorityMode: ProviderPriorityMode
  priority: number | null
  effectivePriority: number
  manifestDefaultPriority: number
  secretsConfigured: Record<string, boolean>
  canEnable: boolean
  values: Record<string, unknown>
  settingsFields: ProviderSettingsField[]
  supportsTest: boolean
  capabilities: string[]
  updatedAt?: string
}

export interface ProviderCatalogGroup {
  marketGroup: string
  label: string
  providers: PublicProviderRuntime[]
}

export interface ProviderCatalogResponse {
  groups: ProviderCatalogGroup[]
}

export interface InstalledProviderSummary {
  providerId: string
  version: string
  title: string
  installedAt: string
  loaded: boolean
  marketGroup?: string
}

export interface InstalledProvidersResponse {
  providers: InstalledProviderSummary[]
  providersDir?: string
}

export interface PublicProviderBindingOverride {
  market: string
  assetClass: string
  capability: string
  label: string
  manifestDefaultPriority: number
  overrideEnabled: boolean | null
  overridePriority: number | null
  effectivePriority: number
}
