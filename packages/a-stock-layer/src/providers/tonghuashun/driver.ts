import { applyManifestSpec } from '../common/driver-factory.js'
import { TONGHUASHUN_SPEC } from './manifest.js'
import { TonghuashunMarketHandler } from './markets/cn/handler.js'

export class TonghuashunDriver extends TonghuashunMarketHandler {}

applyManifestSpec(TonghuashunDriver, TONGHUASHUN_SPEC)
