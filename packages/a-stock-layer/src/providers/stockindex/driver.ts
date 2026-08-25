import { applyManifestSpec } from '../common/driver-factory.js'
import { STOCKINDEX_SPEC } from './manifest.js'
import { StockIndexHandler, mixStockIndexExt } from './handler.js'
import { isStockIndexEnabled } from './settings.js'

export class StockIndexDriver extends StockIndexHandler {}

mixStockIndexExt(StockIndexDriver)
applyManifestSpec(StockIndexDriver, STOCKINDEX_SPEC, { isRuntimeEnabled: isStockIndexEnabled })
