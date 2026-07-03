import { applyManifestSpec } from '../common/driver-factory.js'
import { SINA_SPEC } from './manifest.js'
import { SinaMarketHandler } from './markets/cn/handler.js'

export class SinaDriver extends SinaMarketHandler {}

applyManifestSpec(SinaDriver, SINA_SPEC)
