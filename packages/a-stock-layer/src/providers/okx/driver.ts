import { applyManifestSpec } from '../common/driver-factory.js'
import { OKX_SPEC } from './manifest.js'
import { OkxMarketHandler } from './markets/crypto/handler.js'

export class OkxDriver extends OkxMarketHandler {}

applyManifestSpec(OkxDriver, OKX_SPEC)
