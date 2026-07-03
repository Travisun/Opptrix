import { applyManifestSpec } from '../common/driver-factory.js'
import { POLYGON_SPEC } from './manifest.js'
import { PolygonMarketHandler } from './markets/us/handler.js'
import { isPolygonEnabled } from './config.js'

export class PolygonDriver extends PolygonMarketHandler {}

applyManifestSpec(PolygonDriver, POLYGON_SPEC, { isRuntimeEnabled: isPolygonEnabled })
export { testPolygonConnection } from './api/client.js'
