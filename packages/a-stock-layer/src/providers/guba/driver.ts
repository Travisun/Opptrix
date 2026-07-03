import { applyManifestSpec } from '../common/driver-factory.js'
import { GUBA_SPEC } from './manifest.js'
import { GubaMarketHandler } from './markets/cn/handler.js'

export class GubaDriver extends GubaMarketHandler {}

applyManifestSpec(GubaDriver, GUBA_SPEC)
