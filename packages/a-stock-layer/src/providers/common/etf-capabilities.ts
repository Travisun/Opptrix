import { Capability } from '../../core/capabilities.js'

/** 免费 zzshare / baostock / tickflow 可提供的 CN ETF 扩展能力 */
export const FREE_CN_ETF_CAPABILITIES = [
  Capability.ETF_LIST,
  Capability.ETF_PROFILE,
  Capability.ETF_NAV,
] as const

/** baostock 额外支持指数成分代理 ETF 持仓 */
export const FREE_CN_ETF_HOLDINGS_CAPABILITIES = [
  Capability.ETF_HOLDINGS,
] as const

/** 已注销 sinafinance — 保留常量供 legacy manifest 引用 */
export const SINA_CN_ETF_CAPABILITIES = [
  Capability.ETF_LIST,
  Capability.ETF_PROFILE,
  Capability.ETF_NAV,
  Capability.ETF_HOLDINGS,
] as const

/** 已注销 tencent — 保留常量供 legacy manifest 引用 */
export const TENCENT_CN_ETF_CAPABILITIES = [
  Capability.ETF_LIST,
  Capability.ETF_PROFILE,
  Capability.ETF_NAV,
  Capability.ETF_HOLDINGS,
] as const
