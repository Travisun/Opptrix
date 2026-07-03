import { applyManifestSpec } from '../common/driver-factory.js'
import { CSINDEX_SPEC } from './manifest.js'
import { CsindexMarketHandler } from './markets/cn/handler.js'

export class CsindexDriver extends CsindexMarketHandler {}

applyManifestSpec(CsindexDriver, CSINDEX_SPEC)
