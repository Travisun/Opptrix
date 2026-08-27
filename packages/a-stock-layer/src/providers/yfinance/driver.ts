import { applyManifestSpec } from '../common/driver-factory.js'
import { YFINANCE_SPEC } from './manifest.js'
import { YfinanceMarketHandler } from './handler.js'

export class YfinanceDriver extends YfinanceMarketHandler {}

applyManifestSpec(YfinanceDriver, YFINANCE_SPEC)
