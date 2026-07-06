import { BaseDriver } from './base.js'
import type { Capability } from '../../core/capabilities.js'
import type { ProviderManifestSpec } from './types.js'

/** Satisfies BaseDriver typing on market handlers; *Driver applies manifest via applyManifestSpec */
export abstract class MarketHandlerShell extends BaseDriver {
  get name() { return '' }
  get priority() { return 0 }
  capabilities(): Capability[] { return [] }
}

/** Apply manifest spec onto a BaseDriver subclass prototype */
export function applyManifestSpec(
  DriverClass: typeof BaseDriver,
  spec: ProviderManifestSpec,
  opts?: { isRuntimeEnabled?: () => boolean },
) {
  Object.defineProperties(DriverClass.prototype, {
    name: { get() { return spec.id } },
    priority: { get() { return spec.defaultPriority } },
    ...(spec.maxConcurrent !== undefined
      ? { maxConcurrent: { get() { return spec.maxConcurrent } } }
      : {}),
  })
  DriverClass.prototype.capabilities = function capabilities() {
    return spec.capabilities
  }
  DriverClass.prototype.bindings = function bindings() {
    return spec.bindingsFor(this.priority, this.maxConcurrent)
  }
  if (opts?.isRuntimeEnabled) {
    ;(DriverClass.prototype as BaseDriver & { isRuntimeEnabled: () => boolean }).isRuntimeEnabled =
      opts.isRuntimeEnabled
  }
}

/** Copy handler methods from markets module onto driver prototype */
export function bindHandlerMethods(
  DriverClass: typeof BaseDriver,
  handlers: Record<string, (...args: unknown[]) => unknown>,
) {
  for (const [key, fn] of Object.entries(handlers)) {
    if (typeof fn === 'function') {
      ;(DriverClass.prototype as unknown as Record<string, unknown>)[key] = fn
    }
  }
}
