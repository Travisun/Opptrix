import { applyManifestSpec } from '../common/driver-factory.js'
import { TDX_SPEC } from './manifest.js'
import { TdxMarketHandler } from './markets/cn/handler.js'

export class TdxDriver extends TdxMarketHandler {}

applyManifestSpec(TdxDriver, TDX_SPEC)
