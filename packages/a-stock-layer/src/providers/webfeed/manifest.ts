import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { cnEquityEtfIndex } from '../common/bindings.js'
import { WEBFEED_SETTINGS } from './settings.js'

/** 公开免费接口聚合能力（新浪等回退源） */
export const WEBFEED_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.STOCK_LIST,
  Capability.MARKET_BREADTH,
  Capability.GLOBAL_INDEX,
]

const INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

const EQUITY_CAPS = WEBFEED_CAPS.filter(c => !INDEX_CAPS.includes(c))

export const WEBFEED_SPEC: ProviderManifestSpec = {
  id: 'webfeed',
  title: '网络补充',
  subtitle: '公开免费接口聚合（新浪财经等），主源失败时回退',
  marketGroup: 'CN',
  defaultPriority: 50,
  capabilities: WEBFEED_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
    EQUITY_CAPS.filter(c => ![
      Capability.GLOBAL_INDEX,
      Capability.MARKET_BREADTH,
    ].includes(c)),
    INDEX_CAPS,
    p,
    [Capability.STOCK_REALTIME, Capability.STOCK_KLINE],
    maxConcurrent,
  ),
  settings: WEBFEED_SETTINGS,
  supportsTest: true,
}

export const WEBFEED_MANIFEST = providerManifestEntry(
  'webfeed',
  '网络补充',
  '公开免费接口聚合（新浪财经等），主源失败时回退',
  'CN',
  50,
  WEBFEED_SETTINGS,
)
