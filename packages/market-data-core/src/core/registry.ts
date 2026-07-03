import type { AssetClass, Market } from '@opptrix/shared'
import { Capability } from './capabilities.js'
import type { RegistryProvider } from './provider-types.js'
import { bindingKey, type BindingKey } from './bindings.js'

/** Bridge to user-store provider settings — implemented in a-stock-layer */
export interface ProviderConfigBridge {
  effectivePriority(providerId: string, manifestDefault: number): number
  effectivePriorityForBinding(
    providerId: string,
    bindingDefault: number,
    market: Market,
    assetClass: AssetClass,
    capability: string,
  ): number
}

/** Driver registry — capability index with (market × assetClass) scope */
export class DriverRegistry {
  private drivers = new Map<string, RegistryProvider>()
  private capIndex = new Map<Capability, string[]>()
  private bindingIndex = new Map<BindingKey, string[]>()
  private effectivePriorityCache = new Map<string, number>()
  private configStore: ProviderConfigBridge | null = null

  bindConfigStore(store: ProviderConfigBridge) {
    this.configStore = store
    this.refreshPriorities(store)
  }

  refreshPriorities(store?: ProviderConfigBridge) {
    const cs = store ?? this.configStore
    this.effectivePriorityCache.clear()
    if (!cs) {
      for (const [name, driver] of this.drivers) {
        this.effectivePriorityCache.set(name, driver.priority)
      }
    } else {
      for (const name of this.drivers.keys()) {
        const driver = this.drivers.get(name)!
        this.effectivePriorityCache.set(name, cs.effectivePriority(name, driver.priority))
      }
    }
    this.rebuildIndices()
  }

  private rebuildIndices() {
    this.capIndex.clear()
    this.bindingIndex.clear()
    for (const driver of this.drivers.values()) {
      const seenBinding = new Set<string>()
      for (const binding of driver.bindings()) {
        const cap = binding.capability as Capability
        const key = bindingKey(binding.market, binding.assetClass, cap)
        if (!seenBinding.has(key)) {
          const blist = this.bindingIndex.get(key) ?? []
          if (!blist.includes(driver.name)) blist.push(driver.name)
          this.bindingIndex.set(key, blist)
          seenBinding.add(key)
        }
        const clist = this.capIndex.get(cap) ?? []
        if (!clist.includes(driver.name)) clist.push(driver.name)
        this.capIndex.set(cap, clist)
      }
    }
    const sortList = (list: string[]) => {
      list.sort((a, b) => this.getEffectivePriority(b) - this.getEffectivePriority(a))
    }
    for (const [cap, list] of this.capIndex) {
      sortList(list)
      this.capIndex.set(cap, list)
    }
    for (const [key, list] of this.bindingIndex) {
      sortList(list)
      this.bindingIndex.set(key, list)
    }
  }

  getEffectivePriority(name: string): number {
    return this.effectivePriorityCache.get(name) ?? 0
  }

  register(driver: RegistryProvider) {
    this.drivers.set(driver.name, driver)
    const effective = this.configStore
      ? this.configStore.effectivePriority(driver.name, driver.priority)
      : driver.priority
    this.effectivePriorityCache.set(driver.name, effective)
    this.rebuildIndices()
  }

  unregister(name: string) {
    if (!this.drivers.has(name)) return
    this.drivers.delete(name)
    this.effectivePriorityCache.delete(name)
    this.rebuildIndices()
  }

  get(name: string) { return this.drivers.get(name) }

  listDrivers() { return [...this.drivers.keys()] }

  getProviders(market: Market, assetClass: AssetClass, cap: Capability): RegistryProvider[] {
    const key = bindingKey(market, assetClass, cap)
    const names = this.bindingIndex.get(key) ?? []
    return names
      .map(name => {
        const driver = this.drivers.get(name)
        if (!driver) return null
        const binding = driver.bindings().find(
          b => bindingKey(b.market, b.assetClass, b.capability as Capability) === key,
        )
        const bindingDefault = binding?.defaultPriority ?? driver.priority
        const priority = this.getEffectivePriorityForBinding(
          name, market, assetClass, cap, bindingDefault,
        )
        return { driver, priority }
      })
      .filter((row): row is { driver: RegistryProvider; priority: number } => row != null && row.priority > 0)
      .sort((a, b) => b.priority - a.priority)
      .map(row => row.driver)
  }

  getEffectivePriorityForBinding(
    name: string,
    market: Market,
    assetClass: AssetClass,
    cap: Capability,
    bindingDefaultPriority: number,
  ): number {
    if (this.configStore) {
      return this.configStore.effectivePriorityForBinding(
        name, bindingDefaultPriority, market, assetClass, cap,
      )
    }
    return this.getEffectivePriority(name)
  }

  getProvidersWithFallback(market: Market, assetClass: AssetClass, cap: Capability): RegistryProvider[] {
    const primary = this.getProviders(market, assetClass, cap)
    if (primary.length) return primary
    if (assetClass === 'ETF' && (cap === Capability.STOCK_REALTIME || cap === Capability.STOCK_KLINE)) {
      return this.getProviders(market, 'EQUITY', cap)
    }
    return primary
  }

  getDriversForCapability(cap: Capability): RegistryProvider[] {
    return this.getProvidersWithFallback('CN', 'EQUITY', cap)
  }

  listDriverInfo() {
    return this.listDrivers().map(name => {
      const d = this.drivers.get(name)!
      return {
        name,
        priority: this.getEffectivePriority(name),
        manifestPriority: d.priority,
        capabilities: d.capabilities(),
        bindings: d.bindings(),
      }
    })
  }

  listBindings() {
    const out: Array<{ providerId: string; market: Market; assetClass: AssetClass; capability: Capability; priority: number }> = []
    for (const driver of this.drivers.values()) {
      for (const b of driver.bindings()) {
        out.push({
          providerId: driver.name,
          market: b.market,
          assetClass: b.assetClass,
          capability: b.capability as Capability,
          priority: this.getEffectivePriority(driver.name),
        })
      }
    }
    return out
  }
}
