import { applyManifestSpec } from '../common/driver-factory.js'
import { YFINANCE_SPEC } from './manifest.js'
import { YfinanceMarketHandler } from './markets/handler.js'
import { isYfinanceEnabled } from './config.js'

export class YfinanceDriver extends YfinanceMarketHandler {}

applyManifestSpec(YfinanceDriver, YFINANCE_SPEC, { isRuntimeEnabled: isYfinanceEnabled })

export { testYfinanceConnection } from './api/client.js'
