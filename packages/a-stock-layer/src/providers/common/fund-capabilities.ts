import { Capability } from '../../core/capabilities.js'

/** 新浪 sinafinance — 公募基金标准五件套（列表 / 概况 / 净值 / 持仓 / 净值快照） */
export const SINA_CN_FUND_CAPABILITIES = [
  Capability.FUND_LIST,
  Capability.FUND_PROFILE,
  Capability.FUND_NAV,
  Capability.FUND_HOLDINGS,
  Capability.FUND_QUOTE,
] as const
