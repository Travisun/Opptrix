import { applyManifestSpec } from '../common/driver-factory.js'
import { CNINFO_SPEC } from './manifest.js'
import { CninfoMarketHandler } from './markets/cn/handler.js'

export class CninfoDriver extends CninfoMarketHandler {}

applyManifestSpec(CninfoDriver, CNINFO_SPEC)
