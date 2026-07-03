import { applyManifestSpec } from '../common/driver-factory.js'
import { STATS_GOV_SPEC } from './manifest.js'
import { StatsGovMarketHandler } from './markets/global/handler.js'

export class StatsGovDriver extends StatsGovMarketHandler {}

applyManifestSpec(StatsGovDriver, STATS_GOV_SPEC)
