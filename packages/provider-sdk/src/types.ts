import type { Capability, RegistryProvider } from '@opptrix/market-data-core'
import type {
  MarketGroup,
  ProviderBinding,
  ProviderManifest,
  ProviderSettingsDefinition,
} from '@opptrix/shared'

/** Runtime services exposed to third-party provider entry modules */
export interface ProviderRuntimeContext {
  providerId: string
  settings: {
    enabled: boolean
    priority: number | null
    values: Record<string, unknown>
  }
  paths?: {
    userDataRoot: string
  }
  log?: {
    info: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
    error: (message: string, meta?: Record<string, unknown>) => void
  }
}

/** In-process provider module contract for plugin entry points */
export interface OpptrixProviderModule {
  manifest: ProviderManifest
  capabilities: Capability[]
  bindings: ProviderBinding[]
  settings?: ProviderSettingsDefinition
  createDriver?: (ctx: ProviderRuntimeContext) => RegistryProvider
}

export interface ProviderJsonEngine {
  minAppVersion: string
  sdkVersion: string
}

export interface ProviderJsonPublisher {
  name: string
  url?: string
  email?: string
}

export interface ProviderJsonTrust {
  level?: string
  signedBy?: string
  checksum?: string
}

/** Static `provider.json` manifest shipped with a provider plugin package */
export interface ProviderJsonManifest {
  schemaVersion: number | string
  providerId: string
  title: string
  subtitle?: string
  marketGroup: MarketGroup
  defaultPriority: number
  capabilities: string[]
  bindings: ProviderBinding[]
  settings?: ProviderSettingsDefinition
  engine: ProviderJsonEngine
  entry: string
  publisher?: ProviderJsonPublisher
  trust?: ProviderJsonTrust
}

export interface ProviderValidationResult {
  valid: boolean
  errors: string[]
}
