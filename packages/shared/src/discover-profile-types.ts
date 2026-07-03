/** 挖掘 Profile 类型 — 独立文件避免 discover-profiles ↔ registry 循环依赖 */

export type DiscoverStrategyProfile =
  | 'cn_equity'
  | 'cn_etf'
  | 'us_equity'
  | 'crypto_spot'
  | 'jp_equity'
  | 'kr_equity'
  | 'hk_equity'

export const DISCOVER_STRATEGY_PROFILES: DiscoverStrategyProfile[] = [
  'cn_equity',
  'cn_etf',
  'us_equity',
  'crypto_spot',
  'jp_equity',
  'kr_equity',
  'hk_equity',
]

export function isDiscoverStrategyProfile(v: string): v is DiscoverStrategyProfile {
  return (DISCOVER_STRATEGY_PROFILES as readonly string[]).includes(v)
}
