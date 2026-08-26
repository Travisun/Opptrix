import { applyManifestSpec } from '../common/driver-factory.js'
import { STOCKINDEX_SPEC } from './manifest.js'
import { StockIndexHandler } from './handler.js'
import { isStockIndexEnabled } from './settings.js'

export class StockIndexDriver extends StockIndexHandler {}

applyManifestSpec(StockIndexDriver, STOCKINDEX_SPEC, { isRuntimeEnabled: isStockIndexEnabled })
