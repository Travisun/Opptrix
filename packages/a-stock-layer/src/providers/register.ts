import { DriverRegistry } from '../core/registry.js'
import { TushareDriver } from './tushare/driver.js'
import { TickflowDriver } from './tickflow/driver.js'
import { BinanceDriver } from './binance/driver.js'
import { OkxDriver } from './okx/driver.js'
import { BaostockDriver } from './baostock/driver.js'
import { ZzshareDriver } from './zzshare/driver.js'

/** Register built-in data providers (Tushare, TickFlow, Binance, OKX, Baostock, Zzshare). */
export function registerAllDrivers(registry: DriverRegistry) {
  const drivers = [
    new TushareDriver(),
    new TickflowDriver(),
    new BinanceDriver(),
    new OkxDriver(),
    new BaostockDriver(),
    new ZzshareDriver(),
  ]
  for (const d of drivers) registry.register(d)
  return drivers.length
}

export {
  TushareDriver,
  TickflowDriver,
  BinanceDriver,
  OkxDriver,
  BaostockDriver,
  ZzshareDriver,
}
