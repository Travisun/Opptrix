import { DriverRegistry } from '../core/registry.js'
import { TushareDriver } from './tushare/driver.js'
import { TickflowDriver } from './tickflow/driver.js'
import { BinanceDriver } from './binance/driver.js'
import { OkxDriver } from './okx/driver.js'
import { BaostockDriver } from './baostock/driver.js'
import { ZzshareDriver } from './zzshare/driver.js'
import { TonghuashunDriver } from './tonghuashun/driver.js'
import { SinafinanceDriver } from './sinafinance/driver.js'
import { TencentDriver } from './tencent/driver.js'
import { StockIndexDriver } from './stockindex/driver.js'
import { AkshareDriver } from './akshare/driver.js'
import { EastmoneyDriver } from './eastmoney/driver.js'

/** Register built-in data providers. */
export function registerAllDrivers(registry: DriverRegistry) {
  const drivers = [
    new TushareDriver(),
    new TickflowDriver(),
    new BinanceDriver(),
    new OkxDriver(),
    new BaostockDriver(),
    new ZzshareDriver(),
    new TonghuashunDriver(),
    new TencentDriver(),
    new SinafinanceDriver(),
    new StockIndexDriver(),
    new AkshareDriver(),
    new EastmoneyDriver(),
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
  TonghuashunDriver,
  TencentDriver,
  SinafinanceDriver,
  StockIndexDriver,
  AkshareDriver,
  EastmoneyDriver,
}
