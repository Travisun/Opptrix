import { applyManifestSpec } from '../common/driver-factory.js'
import { NETEASE_SPEC } from './manifest.js'
import { NeteaseMarketHandler } from './markets/cn/handler.js'

export class NeteaseDriver extends NeteaseMarketHandler {}

applyManifestSpec(NeteaseDriver, NETEASE_SPEC)
