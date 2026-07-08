import { applyManifestSpec } from '../common/driver-factory.js'
import { TENCENT_SPEC } from './manifest.js'
import { TencentCnHandler } from './markets/cn/handler.js'
import { mixTencentExt } from './markets/cn/ext.js'
import { mixTencentEtf } from './markets/cn/etf.js'

export class TencentDriver extends TencentCnHandler {}

mixTencentExt(TencentDriver)
mixTencentEtf(TencentDriver)
applyManifestSpec(TencentDriver, TENCENT_SPEC)
