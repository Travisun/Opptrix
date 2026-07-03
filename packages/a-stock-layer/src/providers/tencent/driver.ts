import { applyManifestSpec } from '../common/driver-factory.js'
import { TENCENT_SPEC } from './manifest.js'
import { TencentMarketHandler } from './markets/cn/handler.js'

export class TencentDriver extends TencentMarketHandler {}

applyManifestSpec(TencentDriver, TENCENT_SPEC)
