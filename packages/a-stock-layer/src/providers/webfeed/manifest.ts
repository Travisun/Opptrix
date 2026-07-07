import { SINAFINANCE_CAPS } from '../sinafinance/manifest.js'
import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { cnEquityEtfIndex } from '../common/bindings.js'
import { WEBFEED_SETTINGS } from './settings.js'

/**
 * 兼容别名 — 能力与 `sinafinance` 相同，优先级更低。
 * @deprecated 新集成请使用 `sinafinance` Provider。
 */
export const WEBFEED_CAPS = SINAFINANCE_CAPS

const INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

const EQUITY_CAPS = WEBFEED_CAPS.filter(c => !INDEX_CAPS.includes(c))

export const WEBFEED_SPEC: ProviderManifestSpec = {
  id: 'webfeed',
  title: '网络补充',
  subtitle: '新浪财经兼容别名（请优先启用「新浪财经」sinafinance）',
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
    [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.NEWS,
      Capability.STOCK_PROFILE,
      Capability.STOCK_MONEY_FLOW,
      Capability.SHAREHOLDER,
    ],
    maxConcurrent,
  ),
  settings: WEBFEED_SETTINGS,
  supportsTest: true,
}

export const WEBFEED_MANIFEST = providerManifestEntry(
  'webfeed',
  '网络补充',
  '新浪财经兼容别名（请优先使用 sinafinance）',
  'CN',
  50,
  WEBFEED_SETTINGS,
)
