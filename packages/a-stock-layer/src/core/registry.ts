import { Capability } from './capabilities.js'
import type { BaseDriver } from '../drivers/base.js'

/** Driver registry — priority-sorted capability index (aaashare port) */
export class DriverRegistry {
  private drivers = new Map<string, BaseDriver>()
  private capIndex = new Map<Capability, string[]>()

  register(driver: BaseDriver) {
    this.drivers.set(driver.name, driver)
    for (const cap of driver.capabilities()) {
      const list = this.capIndex.get(cap) ?? []
      list.push(driver.name)
      list.sort((a, b) => (this.drivers.get(b)?.priority ?? 0) - (this.drivers.get(a)?.priority ?? 0))
      this.capIndex.set(cap, list)
    }
  }

  unregister(name: string) {
    const d = this.drivers.get(name)
    if (!d) return
    this.drivers.delete(name)
    for (const cap of d.capabilities()) {
      const list = (this.capIndex.get(cap) ?? []).filter(n => n !== name)
      if (list.length) this.capIndex.set(cap, list)
      else this.capIndex.delete(cap)
    }
  }

  get(name: string) { return this.drivers.get(name) }

  listDrivers() { return [...this.drivers.keys()] }

  getDriversForCapability(cap: Capability): BaseDriver[] {
    return (this.capIndex.get(cap) ?? [])
      .map(n => this.drivers.get(n))
      .filter((d): d is BaseDriver => d != null && d.priority > 0)
      .sort((a, b) => b.priority - a.priority)
  }

  listDriverInfo() {
    return this.listDrivers().map(name => {
      const d = this.drivers.get(name)!
      return { name, priority: d.priority, capabilities: d.capabilities() }
    })
  }
}
