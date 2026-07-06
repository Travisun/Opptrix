import { applyManifestSpec } from '../common/driver-factory.js'
import { EASTMONEY_SPEC } from './manifest.js'
import { EastMoneyMarketHandler } from './markets/cn/handler.js'
import { mixEastMoneyResearch } from './markets/cn/research.js'
import { mixEastMoneyChain } from './markets/cn/chain.js'
import { isEastmoneyEnabled } from './config.js'

export class EastMoneyDriver extends EastMoneyMarketHandler {
  override readonly selfThrottled = true
}

applyManifestSpec(EastMoneyDriver, EASTMONEY_SPEC, { isRuntimeEnabled: isEastmoneyEnabled })
mixEastMoneyResearch(EastMoneyDriver)
mixEastMoneyChain(EastMoneyDriver)

export { testEastmoneyConnection } from './api/client.js'
