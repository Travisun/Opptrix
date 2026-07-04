import { applyManifestSpec } from '../common/driver-factory.js'
import { TDX_SPEC } from './manifest.js'
import { TdxMarketHandler } from './markets/cn/handler.js'
import { isTdxEnabled } from './config.js'

export class TdxDriver extends TdxMarketHandler {}

applyManifestSpec(TdxDriver, TDX_SPEC, { isRuntimeEnabled: isTdxEnabled })

export { testTdxConnection } from './api/client.js'
