import { DriverRegistry } from '../core/registry.js'
import { TushareDriver } from './tushare/driver.js'
import { TickflowDriver } from './tickflow/driver.js'
import { BinanceDriver } from './binance/driver.js'
import { OkxDriver } from './okx/driver.js'
import { BaostockDriver } from './baostock/driver.js'
import { ZzshareDriver } from './zzshare/driver.js'
import { TonghuashunDriver } from './tonghuashun/driver.js'
import { CninfoDriver } from './cninfo/driver.js'
import { EastMoneyDriver } from './eastmoney/driver.js'
import { TdxDriver } from './tdx/driver.js'
import { NeteaseDriver } from './netease/driver.js'
import { SinaDriver } from './sina/driver.js'
import { YfinanceDriver } from './yfinance/driver.js'
import { AkshareDriver } from './akshare/driver.js'

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
    new CninfoDriver(),
    new EastMoneyDriver(),
    new TdxDriver(),
    new NeteaseDriver(),
    new SinaDriver(),
    new YfinanceDriver(),
    new AkshareDriver(),
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
  CninfoDriver,
  EastMoneyDriver,
  TdxDriver,
  NeteaseDriver,
  SinaDriver,
  YfinanceDriver,
  AkshareDriver,
}
