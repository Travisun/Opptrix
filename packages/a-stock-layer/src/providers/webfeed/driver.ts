import { applyManifestSpec } from '../common/driver-factory.js'
import { WEBFEED_SPEC } from './manifest.js'
import { WebfeedCnHandler } from './markets/cn/handler.js'

export class WebfeedDriver extends WebfeedCnHandler {}

applyManifestSpec(WebfeedDriver, WEBFEED_SPEC)
