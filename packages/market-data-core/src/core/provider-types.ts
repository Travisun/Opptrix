import type { ProviderBinding } from '@opptrix/shared'
import type { Capability } from './capabilities.js'

/** Minimal provider surface for DriverRegistry — decouples core from driver implementations */
export interface RegistryProvider {
  readonly name: string
  readonly priority: number
  capabilities(): Capability[]
  bindings(): ProviderBinding[]
  isRuntimeEnabled?(): boolean
}
