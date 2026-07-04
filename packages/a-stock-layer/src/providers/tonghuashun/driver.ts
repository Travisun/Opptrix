import { applyManifestSpec } from '../common/driver-factory.js'
import { TONGHUASHUN_SPEC } from './manifest.js'
import { TonghuashunMarketHandler } from './markets/cn/handler.js'
import { isTonghuashunEnabled } from './config.js'

export class TonghuashunDriver extends TonghuashunMarketHandler {}

applyManifestSpec(TonghuashunDriver, TONGHUASHUN_SPEC, { isRuntimeEnabled: isTonghuashunEnabled })
export { testTonghuashunConnection } from './api/client.js'
