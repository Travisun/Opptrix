import { applyManifestSpec } from '../common/driver-factory.js'
import { XUEQIU_SPEC } from './manifest.js'
import { XueqiuMarketHandler } from './markets/cn/handler.js'

export class XueqiuDriver extends XueqiuMarketHandler {}

applyManifestSpec(XueqiuDriver, XUEQIU_SPEC)
