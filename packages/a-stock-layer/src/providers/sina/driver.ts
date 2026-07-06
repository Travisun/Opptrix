import { applyManifestSpec } from '../common/driver-factory.js'
import { SINA_SPEC } from './manifest.js'
import { SinaMarketHandler } from './markets/cn/handler.js'
import { isSinaEnabled } from './config.js'

export class SinaDriver extends SinaMarketHandler {
  override readonly selfThrottled = true
}

applyManifestSpec(SinaDriver, SINA_SPEC, { isRuntimeEnabled: isSinaEnabled })

export { testSinaConnection } from './api/client.js'
