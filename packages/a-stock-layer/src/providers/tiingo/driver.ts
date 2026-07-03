import { applyManifestSpec } from '../common/driver-factory.js'
import { TIINGO_SPEC } from './manifest.js'
import { TiingoMarketHandler } from './markets/us/handler.js'
import { isTiingoEnabled } from './config.js'

export class TiingoDriver extends TiingoMarketHandler {}

applyManifestSpec(TiingoDriver, TIINGO_SPEC, { isRuntimeEnabled: isTiingoEnabled })
export { testTiingoConnection } from './api/client.js'
