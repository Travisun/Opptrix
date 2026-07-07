import type { Capability } from '../../core/capabilities.js'
import type { ProviderBinding } from '@opptrix/shared'
import type { BaseDriver } from './base.js'
import type { ProviderManifestSpec } from './types.js'
import {
  filterBindingsByPermission,
  filterCapabilitiesByPermission,
} from './permission-denial.js'

/**
 * 为 Provider 驱动注入按权限登记动态裁剪的 capabilities / bindings / supports。
 */
export function applyPermissionAwareDriver(
  DriverClass: typeof BaseDriver,
  spec: ProviderManifestSpec,
  resolveCapabilities: () => Capability[],
) {
  const bindingsFor = spec.bindingsFor

  DriverClass.prototype.capabilities = function capabilities(this: BaseDriver) {
    const raw = resolveCapabilities()
    return filterCapabilitiesByPermission(spec.id, raw)
  }

  DriverClass.prototype.bindings = function bindings(this: BaseDriver) {
    const allowed = new Set(this.capabilities())
    const raw = bindingsFor(this.priority, this.maxConcurrent)
      .filter(b => allowed.has(b.capability as Capability))
    return filterBindingsByPermission(spec.id, raw)
  }

  DriverClass.prototype.supports = function supports(this: BaseDriver, cap: Capability) {
    return this.capabilities().includes(cap)
  }
}
