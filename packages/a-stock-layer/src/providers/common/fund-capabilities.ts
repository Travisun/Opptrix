import { Capability } from '../../core/capabilities.js'

/** 已注销 sinafinance — 保留常量供 legacy manifest 引用 */
export const SINA_CN_FUND_CAPABILITIES = [
  Capability.FUND_LIST,
  Capability.FUND_PROFILE,
  Capability.FUND_NAV,
  Capability.FUND_HOLDINGS,
  Capability.FUND_QUOTE,
] as const
