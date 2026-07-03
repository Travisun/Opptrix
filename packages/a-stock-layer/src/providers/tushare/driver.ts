import { applyManifestSpec } from '../common/driver-factory.js'
import { TUSHARE_SPEC } from './manifest.js'
import { TushareMarketHandler } from './markets/cn/handler.js'
import { isTushareEnabled } from './config.js'

export class TushareDriver extends TushareMarketHandler {}

applyManifestSpec(TushareDriver, TUSHARE_SPEC, { isRuntimeEnabled: isTushareEnabled })
