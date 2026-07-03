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
  bindingsFor: (priority: number) => ProviderBinding[]
  settings?: ProviderSettingsDefinition
  supportsTest?: boolean
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
