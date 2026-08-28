import { DriverRegistry } from '../core/registry.js'
import { TushareDriver } from './tushare/driver.js'
import { TickflowDriver } from './tickflow/driver.js'
import { BinanceDriver } from './binance/driver.js'
import { OkxDriver } from './okx/driver.js'
import { TonghuashunDriver } from './tonghuashun/driver.js'
import { StockIndexDriver } from './stockindex/driver.js'

/** Register built-in data providers. baostock / zzshare / yfinance 暂时下线（源码保留，可本地 new 测）。 */
export function registerAllDrivers(registry: DriverRegistry) {
  const drivers = [
    new TushareDriver(),
    new TickflowDriver(),
    new BinanceDriver(),
    new OkxDriver(),
    new TonghuashunDriver(),
    new StockIndexDriver(),
  ]
  for (const d of drivers) registry.register(d)
  return drivers.length
}

export {
  TushareDriver,
  TickflowDriver,
  BinanceDriver,
  OkxDriver,
  TonghuashunDriver,
  StockIndexDriver,
}

/** 源码保留；生产 registerAllDrivers 不再注册。 */
export { YfinanceDriver } from './yfinance/driver.js'

/** 源码保留；生产 registerAllDrivers 不再注册。测试限流等可手动 new。 */
export { BaostockDriver } from './baostock/driver.js'
export { ZzshareDriver } from './zzshare/driver.js'
