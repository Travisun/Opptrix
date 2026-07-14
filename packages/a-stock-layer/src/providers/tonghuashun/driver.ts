import { applyManifestSpec } from '../common/driver-factory.js'
import { TONGHUASHUN_SPEC } from './manifest.js'
import { TonghuashunMarketHandler } from './markets/cn/handler.js'
import { mixTonghuashunExt } from './markets/cn/ext.js'
import { isTonghuashunEnabled } from './config.js'

export class TonghuashunDriver extends TonghuashunMarketHandler {}

mixTonghuashunExt(TonghuashunDriver)
applyManifestSpec(TonghuashunDriver, TONGHUASHUN_SPEC, { isRuntimeEnabled: isTonghuashunEnabled })
export { testTonghuashunConnection } from './api/client.js'
