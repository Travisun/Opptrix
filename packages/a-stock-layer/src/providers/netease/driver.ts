import { applyManifestSpec } from '../common/driver-factory.js'
import { NETEASE_SPEC } from './manifest.js'
import { NeteaseMarketHandler } from './markets/cn/handler.js'
import { isNeteaseEnabled } from './config.js'

export class NeteaseDriver extends NeteaseMarketHandler {
  override readonly selfThrottled = true
}

applyManifestSpec(NeteaseDriver, NETEASE_SPEC, { isRuntimeEnabled: isNeteaseEnabled })

export { testNeteaseConnection } from './api/client.js'
