import { applyManifestSpec } from '../common/driver-factory.js'
import { BAOSTOCK_SPEC } from './manifest.js'
import { BaostockCnHandler } from './markets/cn/handler.js'
import { mixBaostockResearch } from './markets/cn/research.js'
import { isBaostockEnabled } from './config.js'

export class BaostockDriver extends BaostockCnHandler {}

applyManifestSpec(BaostockDriver, BAOSTOCK_SPEC, { isRuntimeEnabled: isBaostockEnabled })
mixBaostockResearch(BaostockDriver)
export { testBaostockConnection } from './api/client.js'
