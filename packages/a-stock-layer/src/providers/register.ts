import { DriverRegistry } from '../core/registry.js'
import { EastMoneyDriver } from './eastmoney/driver.js'
import { TdxDriver } from './tdx/driver.js'
import { TencentDriver } from './tencent/driver.js'
import { SinaDriver } from './sina/driver.js'
import { TonghuashunDriver } from './tonghuashun/driver.js'
import { TushareDriver } from './tushare/driver.js'
import { NeteaseDriver } from './netease/driver.js'
import { XueqiuDriver } from './xueqiu/driver.js'
import { GubaDriver } from './guba/driver.js'
import { CninfoDriver } from './cninfo/driver.js'
import { CsindexDriver } from './csindex/driver.js'
import { StatsGovDriver } from './stats_gov/driver.js'
import { PolygonDriver } from './polygon/driver.js'
import { TiingoDriver } from './tiingo/driver.js'
import { FmpDriver } from './fmp/driver.js'
import { YahooUsDriver } from './yahoo_us/driver.js'
import { BinanceDriver } from './binance/driver.js'
import { OkxDriver } from './okx/driver.js'
import { EfinanceDriver } from './efinance/driver.js'

/** Register all built-in data providers */
export function registerAllDrivers(registry: DriverRegistry) {
  const drivers = [
    new TushareDriver(),
    new PolygonDriver(),
    new TiingoDriver(),
    new FmpDriver(),
    new BinanceDriver(),
    new EastMoneyDriver(),
    new TdxDriver(),
    new EfinanceDriver(),
    new GubaDriver(),
    new StatsGovDriver(),
    new CninfoDriver(),
    new CsindexDriver(),
    new TencentDriver(),
    new SinaDriver(),
    new TonghuashunDriver(),
    new NeteaseDriver(),
    new XueqiuDriver(),
    new YahooUsDriver(),
    new OkxDriver(),
  ]
  for (const d of drivers) registry.register(d)
  return drivers.length
}

export {
  EastMoneyDriver, EfinanceDriver, TdxDriver, TencentDriver,
  SinaDriver, TonghuashunDriver, NeteaseDriver, XueqiuDriver,
  GubaDriver, CninfoDriver, CsindexDriver, StatsGovDriver, TushareDriver,
  PolygonDriver, TiingoDriver, FmpDriver, YahooUsDriver, BinanceDriver, OkxDriver,
}
