import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { cnEquityEtfIndex } from '../common/bindings.js'
import { FREE_CN_ETF_CAPABILITIES } from '../common/etf-capabilities.js'
import { ZZSHARE_SETTINGS } from './settings.js'

export const ZZSHARE_CAPS = [
  Capability.STOCK_KLINE,
  Capability.STOCK_REALTIME,
  Capability.STOCK_BASIC,
  Capability.STOCK_LIST,
  Capability.STOCK_PROFILE,
  Capability.INDEX_KLINE,
  Capability.INDEX_REALTIME,
  Capability.TRADE_CALENDAR,
  Capability.INTRADAY_TICK,
  Capability.DRAGON_TIGER,
  Capability.LIMIT_UPDOWN,
  Capability.MARKET_BREADTH,
  Capability.SENTIMENT,
  Capability.SECTOR_LIST,
  Capability.NEWS,
  Capability.MAIN_BUSINESS,
  Capability.INST_HOLDING,
  Capability.SHAREHOLDER,
  Capability.STOCK_MONEY_FLOW,
  Capability.SECTOR_MONEY_FLOW,
  Capability.MARKET_MONEY_FLOW,
  ...FREE_CN_ETF_CAPABILITIES,
]

const INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

const EQUITY_CAPS = ZZSHARE_CAPS.filter(c => !INDEX_CAPS.includes(c))

export const ZZSHARE_SPEC: ProviderManifestSpec = {
  id: 'zzshare',
  title: '自在量化',
  subtitle: '自在量化行情数据服务',
  marketGroup: 'CN',
  defaultPriority: 110,
  maxConcurrent: 5,
  capabilities: ZZSHARE_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
    EQUITY_CAPS,
    INDEX_CAPS,
    p,
    [...FREE_CN_ETF_CAPABILITIES],
    maxConcurrent,
  ),
  settings: ZZSHARE_SETTINGS,
  supportsTest: true,
}

export const ZZSHARE_MANIFEST = providerManifestEntry(
  'zzshare',
  '自在量化',
  '免费 A 股行情·涨停复盘·龙虎榜·情绪；Token 可选提升频率',
  'CN',
  110,
  ZZSHARE_SETTINGS,
)
