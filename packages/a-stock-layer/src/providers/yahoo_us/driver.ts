import { applyManifestSpec } from '../common/driver-factory.js'
import { YAHOO_US_SPEC } from './manifest.js'
import { YahooUsMarketHandler } from './markets/us/handler.js'

export class YahooUsDriver extends YahooUsMarketHandler {}

applyManifestSpec(YahooUsDriver, YAHOO_US_SPEC)
