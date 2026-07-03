import { applyManifestSpec } from '../common/driver-factory.js'
import { BINANCE_SPEC } from './manifest.js'
import { BinanceMarketHandler } from './markets/crypto/handler.js'

export class BinanceDriver extends BinanceMarketHandler {}

applyManifestSpec(BinanceDriver, BINANCE_SPEC)
