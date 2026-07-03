import { applyManifestSpec } from '../common/driver-factory.js'
import { EFINANCE_SPEC } from './manifest.js'
import { EfinanceMarketHandler } from './markets/cn/handler.js'

export class EfinanceDriver extends EfinanceMarketHandler {}

applyManifestSpec(EfinanceDriver, EFINANCE_SPEC)
