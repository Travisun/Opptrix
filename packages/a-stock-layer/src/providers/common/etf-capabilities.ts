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

/** 新浪 sinafinance — ETF 四件套（列表 / 概况 / 真实净值 / 宽基持仓代理） */
export const SINA_CN_ETF_CAPABILITIES = [
  Capability.ETF_LIST,
  Capability.ETF_PROFILE,
  Capability.ETF_NAV,
  Capability.ETF_HOLDINGS,
] as const

/** 腾讯行情 — ETF 标准方法（K 线代理净值 + 宽基持仓代理） */
export const TENCENT_CN_ETF_CAPABILITIES = [
  Capability.ETF_LIST,
  Capability.ETF_PROFILE,
  Capability.ETF_NAV,
  Capability.ETF_HOLDINGS,
] as const
