import { applyManifestSpec } from '../common/driver-factory.js'
import { CNINFO_SPEC } from './manifest.js'
import { CninfoMarketHandler } from './markets/cn/handler.js'
import { isCninfoEnabled } from './config.js'

export class CninfoDriver extends CninfoMarketHandler {
  override readonly selfThrottled = true
}

applyManifestSpec(CninfoDriver, CNINFO_SPEC, { isRuntimeEnabled: isCninfoEnabled })

export { testCninfoConnection } from './api/client.js'
