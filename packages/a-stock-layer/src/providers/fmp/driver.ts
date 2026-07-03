import { applyManifestSpec } from '../common/driver-factory.js'
import { FMP_SPEC } from './manifest.js'
import { FmpMarketHandler } from './markets/us/handler.js'
import { isFmpEnabled } from './config.js'

export class FmpDriver extends FmpMarketHandler {}

applyManifestSpec(FmpDriver, FMP_SPEC, { isRuntimeEnabled: isFmpEnabled })
export { testFmpConnection } from './api/client.js'
