import { applyManifestSpec } from '../common/driver-factory.js'
import { EASTMONEY_SPEC } from './manifest.js'
import { EastmoneyCnHandler } from './markets/cn/handler.js'

export class EastmoneyDriver extends EastmoneyCnHandler {}

applyManifestSpec(EastmoneyDriver, EASTMONEY_SPEC)
