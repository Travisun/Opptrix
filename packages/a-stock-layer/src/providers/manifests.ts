import type { MarketGroup, ProviderManifest } from '@opptrix/shared'
import { TUSHARE_MANIFEST } from './tushare/manifest.js'
import { POLYGON_MANIFEST } from './polygon/manifest.js'
import { TIINGO_MANIFEST } from './tiingo/manifest.js'
import { FMP_MANIFEST } from './fmp/manifest.js'
import { YAHOO_US_MANIFEST } from './yahoo_us/manifest.js'
import { BINANCE_MANIFEST } from './binance/manifest.js'
import { OKX_MANIFEST } from './okx/manifest.js'
import { EASTMONEY_MANIFEST } from './eastmoney/manifest.js'
import { TDX_MANIFEST } from './tdx/manifest.js'
import { EFINANCE_MANIFEST } from './efinance/manifest.js'
import { TENCENT_MANIFEST } from './tencent/manifest.js'
import { SINA_MANIFEST } from './sina/manifest.js'
import { TONGHUASHUN_MANIFEST } from './tonghuashun/manifest.js'
import { CSINDEX_MANIFEST } from './csindex/manifest.js'
import { CNINFO_MANIFEST } from './cninfo/manifest.js'
import { NETEASE_MANIFEST } from './netease/manifest.js'
import { STATS_GOV_MANIFEST } from './stats_gov/manifest.js'
import { GUBA_MANIFEST } from './guba/manifest.js'
import { XUEQIU_MANIFEST } from './xueqiu/manifest.js'

export { TUSHARE_SETTINGS } from './tushare/settings.js'
export { POLYGON_SETTINGS } from './polygon/settings.js'
export { TIINGO_SETTINGS } from './tiingo/settings.js'
export { FMP_SETTINGS } from './fmp/settings.js'

/** Static manifest — default priority matches driver getters in code */
export const PROVIDER_MANIFESTS: ProviderManifest[] = [
  TUSHARE_MANIFEST,
  POLYGON_MANIFEST,
  TIINGO_MANIFEST,
  FMP_MANIFEST,
  YAHOO_US_MANIFEST,
  BINANCE_MANIFEST,
  OKX_MANIFEST,
  EASTMONEY_MANIFEST,
  TDX_MANIFEST,
  EFINANCE_MANIFEST,
  TENCENT_MANIFEST,
  SINA_MANIFEST,
  TONGHUASHUN_MANIFEST,
  CSINDEX_MANIFEST,
  CNINFO_MANIFEST,
  NETEASE_MANIFEST,
  STATS_GOV_MANIFEST,
  GUBA_MANIFEST,
  XUEQIU_MANIFEST,
]

const MANIFEST_MAP = new Map(PROVIDER_MANIFESTS.map(m => [m.providerId, m]))

export function getProviderManifest(providerId: string): ProviderManifest | undefined {
  return MANIFEST_MAP.get(providerId)
}

export function listProviderManifests(): ProviderManifest[] {
  return [...PROVIDER_MANIFESTS]
}

export const MARKET_GROUP_LABELS: Record<MarketGroup, string> = {
  CN: 'A 股',
  US: '美股',
  HK: '港股',
  CRYPTO: '加密货币',
  GLOBAL: '全球 / 宏观',
}

export const MARKET_GROUP_ORDER: MarketGroup[] = ['CN', 'US', 'HK', 'CRYPTO', 'GLOBAL']
