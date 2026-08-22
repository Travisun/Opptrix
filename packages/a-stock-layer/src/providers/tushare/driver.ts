import { applyManifestSpec } from '../common/driver-factory.js'
import { TUSHARE_SPEC } from './manifest.js'
import { TushareMarketHandler } from './markets/cn/handler.js'
import { mixTushareFund } from './markets/cn/fund.js'
import { mixTushareFundExt } from './markets/cn/fund-ext.js'
import { isTushareEnabled } from './config.js'

export class TushareDriver extends TushareMarketHandler {}

mixTushareFund(TushareDriver as { prototype: object })
mixTushareFundExt(TushareDriver as { prototype: object })
applyManifestSpec(TushareDriver, TUSHARE_SPEC, { isRuntimeEnabled: isTushareEnabled })
