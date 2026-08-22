import { Capability } from '../../core/capabilities.js'

/** 同花顺 Fuyao — 公募基金标准能力（与东方财富对齐：无 fundList） */
export const TONGHUASHUN_CN_FUND_CAPABILITIES = [
  Capability.FUND_PROFILE,
  Capability.FUND_NAV,
  Capability.FUND_HOLDINGS,
  Capability.FUND_QUOTE,
] as const
