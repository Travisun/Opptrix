import { applyManifestSpec } from '../common/driver-factory.js'
import { SINAFINANCE_SPEC } from './manifest.js'
import { SinafinanceCnHandler } from './markets/cn/handler.js'
import { mixSinafinanceExt } from './markets/cn/ext.js'
import { mixSinafinanceEtf } from './markets/cn/etf.js'

export class SinafinanceDriver extends SinafinanceCnHandler {}

mixSinafinanceExt(SinafinanceDriver)
mixSinafinanceEtf(SinafinanceDriver)
applyManifestSpec(SinafinanceDriver, SINAFINANCE_SPEC)
