import { DriverRegistry } from '../core/registry.js'
import { TushareDriver } from './tushare/driver.js'
import { PolygonDriver } from './polygon/driver.js'
import { TiingoDriver } from './tiingo/driver.js'
import { FmpDriver } from './fmp/driver.js'

/** Register built-in data providers (official API-key services only). */
export function registerAllDrivers(registry: DriverRegistry) {
  const drivers = [
    new TushareDriver(),
    new PolygonDriver(),
    new TiingoDriver(),
    new FmpDriver(),
  ]
  for (const d of drivers) registry.register(d)
  return drivers.length
}

export {
  TushareDriver,
  PolygonDriver, TiingoDriver, FmpDriver,
}
