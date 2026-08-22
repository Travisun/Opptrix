import { Capability } from '../../core/capabilities.js'

/** Tushare Pro — 公募基金标准五件套（与 sinafinance 对齐） */
export const TUSHARE_CN_FUND_CAPABILITIES = [
  Capability.FUND_LIST,
  Capability.FUND_PROFILE,
  Capability.FUND_NAV,
  Capability.FUND_HOLDINGS,
  Capability.FUND_QUOTE,
] as const
