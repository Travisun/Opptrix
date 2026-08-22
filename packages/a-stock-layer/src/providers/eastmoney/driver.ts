import { applyManifestSpec } from '../common/driver-factory.js'
import { EASTMONEY_SPEC } from './manifest.js'
import { EastmoneyCnHandler } from './markets/cn/handler.js'
import { mixEastmoneyFund } from './markets/cn/fund.js'

export class EastmoneyDriver extends EastmoneyCnHandler {}

mixEastmoneyFund(EastmoneyDriver)
applyManifestSpec(EastmoneyDriver, EASTMONEY_SPEC)
