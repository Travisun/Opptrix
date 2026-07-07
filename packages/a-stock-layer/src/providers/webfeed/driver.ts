import { applyManifestSpec } from '../common/driver-factory.js'
import { WEBFEED_SPEC } from './manifest.js'
import { SinafinanceCnHandler } from '../sinafinance/markets/cn/handler.js'
import { mixSinafinanceExt } from '../sinafinance/markets/cn/ext.js'

/**
 * @deprecated 请优先使用 {@link SinafinanceDriver}（`sinafinance`）。
 * 保留 `webfeed` 标识以兼容既有配置与自定义方法调用。
 */
export class WebfeedDriver extends SinafinanceCnHandler {}

mixSinafinanceExt(WebfeedDriver)
applyManifestSpec(WebfeedDriver, WEBFEED_SPEC)
