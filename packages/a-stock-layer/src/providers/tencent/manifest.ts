import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { cnEquityEtfIndex } from '../common/bindings.js'
import { TENCENT_CN_ETF_CAPABILITIES } from '../common/etf-capabilities.js'
import { TENCENT_SETTINGS } from './settings.js'

/** 腾讯行情中心公开接口能力 */
export const TENCENT_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.STOCK_LIST,
  Capability.GLOBAL_INDEX,
  Capability.EXCHANGE_RATE,
  Capability.NEWS,
  Capability.STOCK_PROFILE,
  Capability.STOCK_MONEY_FLOW,
  Capability.INTRADAY_TICK,
  Capability.BLOCK_TRADE,
  Capability.SECTOR_LIST,
  Capability.PEER_COMPANY,
  ...TENCENT_CN_ETF_CAPABILITIES,
]

const INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

const EQUITY_CAPS = TENCENT_CAPS.filter(c => !INDEX_CAPS.includes(c))

export const TENCENT_SPEC: ProviderManifestSpec = {
  id: 'tencent',
  title: '腾讯行情',
  subtitle: '腾讯行情中心公开接口（stockapp.finance.qq.com / proxy.finance.qq.com）',
  marketGroup: 'CN',
  defaultPriority: 55,
  capabilities: TENCENT_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
    EQUITY_CAPS.filter(c => ![
      Capability.GLOBAL_INDEX,
      Capability.EXCHANGE_RATE,
    ].includes(c)),
    INDEX_CAPS,
    p,
    [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.NEWS,
      ...TENCENT_CN_ETF_CAPABILITIES,
    ],
    maxConcurrent,
  ),
  settings: TENCENT_SETTINGS,
  supportsTest: true,
}

export const TENCENT_MANIFEST = providerManifestEntry(
  'tencent',
  '腾讯行情',
  '腾讯行情中心公开接口（板块、个股、研报、资金流等）',
  'CN',
  55,
  TENCENT_SETTINGS,
)
