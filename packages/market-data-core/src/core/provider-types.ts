import type { ProviderBinding } from '@opptrix/shared'
import type { Capability } from './capabilities.js'

/** Minimal provider surface for DriverRegistry — decouples core from driver implementations */
export interface RegistryProvider {
  readonly name: string
  readonly priority: number
  capabilities(): Capability[]
  bindings(): ProviderBinding[]
  isRuntimeEnabled?(): boolean
  /** true = 驱动内部有限流+HTTP超时，引擎不再叠加外层超时 */
  readonly selfThrottled?: boolean
}
