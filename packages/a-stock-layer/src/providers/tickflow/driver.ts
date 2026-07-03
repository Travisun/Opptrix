import { applyManifestSpec } from '../common/driver-factory.js'
import { TICKFLOW_SPEC } from './manifest.js'
import { TickflowMarketHandler } from './markets/handler.js'
import { isTickflowEnabled } from './config.js'

export class TickflowDriver extends TickflowMarketHandler {}

applyManifestSpec(TickflowDriver, TICKFLOW_SPEC, { isRuntimeEnabled: isTickflowEnabled })
export { testTickflowConnection } from './api/client.js'
