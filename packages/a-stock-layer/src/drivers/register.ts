import { DriverRegistry } from '../core/registry.js'
import { EastMoneyDriver } from './eastmoney.js'
import { mixEastMoneyResearch } from './eastmoney-research.js'
import { mixEastMoneyChain } from './eastmoney-chain.js'
import { EfinanceDriver } from './efinance.js'
import { MootdxDriver } from './mootdx.js'
import { PytdxDriver } from './pytdx.js'
import { TencentDriver } from './tencent.js'
import { SinaDriver } from './sina.js'
import { TonghuashunDriver } from './tonghuashun.js'
import { TushareDriver } from './tushare.js'
import { NeteaseDriver } from './netease.js'
import { XueqiuDriver } from './xueqiu.js'
import { GubaDriver } from './guba.js'
import { CninfoDriver } from './cninfo.js'
import { CsindexDriver } from './csindex.js'
import { StatsGovDriver } from './stats-gov.js'

/** Register all built-in aaashare drivers (mirrors discover_and_register_all) */
export function registerAllDrivers(registry: DriverRegistry) {
  mixEastMoneyResearch(EastMoneyDriver)
  mixEastMoneyChain(EastMoneyDriver)
  const drivers = [
    new TushareDriver(),
    new EastMoneyDriver(),
    new MootdxDriver(),
    new PytdxDriver(),
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
  ]
  for (const d of drivers) registry.register(d)
  return drivers.length
}

export {
  EastMoneyDriver, EfinanceDriver, MootdxDriver, PytdxDriver, TencentDriver,
  SinaDriver, TonghuashunDriver, NeteaseDriver, XueqiuDriver,
  GubaDriver, CninfoDriver, CsindexDriver, StatsGovDriver, TushareDriver,
}
