/**
 * Minimal provider plugin types — mirrors @opptrix/provider-sdk when that package is available.
 * TODO: replace with `import type { ... } from '@opptrix/provider-sdk'` once provider-sdk lands.
 */
import type {
  MarketGroup,
  ProviderBinding,
  ProviderManifest,
  ProviderSettingsDefinition,
} from '@opptrix/shared'
import type { RegistryProvider } from '../core/registry.js'

export interface ProviderJsonManifest {
  schemaVersion: number
  providerId: string
  title: string
  subtitle?: string
  marketGroup: MarketGroup
  defaultPriority: number
  entry: string
  version?: string
  settings?: ProviderSettingsDefinition
  capabilities?: string[]
  bindings?: ProviderBinding[]
  engine?: { minAppVersion?: string; sdkVersion?: string }
  publisher?: string
  trust?: string
}

export interface ProviderTestContext {
  providerId: string
  overrides?: Record<string, unknown>
  extra: Record<string, unknown>
}

export type ProviderTestConnectionHook = (
  ctx: ProviderTestContext,
) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }

export interface OpptrixProviderModule {
  driver: RegistryProvider | (new () => RegistryProvider) | (() => RegistryProvider)
  manifest?: ProviderManifest
  testConnection?: ProviderTestConnectionHook
}

export function providerJsonToManifest(json: ProviderJsonManifest): ProviderManifest {
  return {
    providerId: json.providerId,
    title: json.title,
    subtitle: json.subtitle,
    marketGroup: json.marketGroup,
    defaultPriority: json.defaultPriority,
    settings: json.settings,
  }
}

export function validateProviderJson(raw: unknown): ProviderJsonManifest {
  if (!raw || typeof raw !== 'object') throw new Error('provider.json 格式无效')
  const o = raw as Record<string, unknown>
  const providerId = typeof o.providerId === 'string' ? o.providerId.trim()
    : typeof o.id === 'string' ? o.id.trim() : ''
  if (!providerId) throw new Error('provider.json 缺少 providerId')
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title) throw new Error('provider.json 缺少 title')
  const entry = typeof o.entry === 'string' ? o.entry.trim() : ''
  if (!entry) throw new Error('provider.json 缺少 entry')
  const marketGroup = o.marketGroup
  if (typeof marketGroup !== 'string' || !marketGroup.trim()) {
    throw new Error('provider.json 缺少 marketGroup')
  }
  const defaultPriority = typeof o.defaultPriority === 'number' ? o.defaultPriority : 0
  const schemaVersion = typeof o.schemaVersion === 'number' ? o.schemaVersion : 1
  return {
    schemaVersion,
    providerId,
    title,
    subtitle: typeof o.subtitle === 'string' ? o.subtitle : undefined,
    marketGroup: marketGroup as MarketGroup,
    defaultPriority,
    entry,
    version: typeof o.version === 'string' ? o.version : '0.0.0',
    settings: o.settings as ProviderSettingsDefinition | undefined,
    capabilities: Array.isArray(o.capabilities) ? o.capabilities.map(String) : undefined,
    bindings: Array.isArray(o.bindings) ? o.bindings as ProviderBinding[] : undefined,
    engine: o.engine as ProviderJsonManifest['engine'],
    publisher: typeof o.publisher === 'string' ? o.publisher : undefined,
    trust: typeof o.trust === 'string' ? o.trust : undefined,
  }
}
