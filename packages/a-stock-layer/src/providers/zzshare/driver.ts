import { applyManifestSpec } from '../common/driver-factory.js'
import { ZZSHARE_SPEC } from './manifest.js'
import { ZzshareCnHandler } from './markets/cn/handler.js'
import { mixZzshareResearch } from './markets/cn/research.js'
import { isZzshareEnabled } from './config.js'

/** 自在量化驱动入口 — 应用 manifest 并混入研究能力。 */
export class ZzshareDriver extends ZzshareCnHandler {}

applyManifestSpec(ZzshareDriver, ZZSHARE_SPEC, { isRuntimeEnabled: isZzshareEnabled })
mixZzshareResearch(ZzshareDriver)

export { testZzshareConnection } from './api/client.js'
