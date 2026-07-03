import { applyManifestSpec } from '../common/driver-factory.js'
import type { BaseDriver } from '../common/base.js'
import { yahooRegionalSpec } from './manifest.js'
import { YahooRegionalMarketHandler } from './markets/handler.js'

export function createYahooRegionalDrivers(): BaseDriver[] {
  const markets = ['JP', 'KR', 'HK'] as const
  return markets.map(market => {
    class Driver extends YahooRegionalMarketHandler {
      constructor() {
        super(market)
      }
    }
    applyManifestSpec(Driver, yahooRegionalSpec(market))
    return new Driver()
  })
}
