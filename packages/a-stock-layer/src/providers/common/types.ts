import type { Capability } from '../../core/capabilities.js'
import type { ProviderBinding, ProviderManifest, ProviderSettingsDefinition } from '@opptrix/shared'

/** Static provider module contract — §6.4 manifest + bindings in one place */
export interface ProviderManifestSpec {
  id: string
  title: string
  subtitle: string
  marketGroup: ProviderManifest['marketGroup']
  defaultPriority: number
  capabilities: Capability[]
  bindingsFor: (priority: number, maxConcurrent?: number) => ProviderBinding[]
  settings?: ProviderSettingsDefinition
  supportsTest?: boolean
  /** 最大并发请求数（负载均衡硬限制） */
  maxConcurrent?: number
}

export function buildManifest(spec: ProviderManifestSpec): ProviderManifest {
  return {
    providerId: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    marketGroup: spec.marketGroup,
    defaultPriority: spec.defaultPriority,
    settings: spec.settings,
  }
}
