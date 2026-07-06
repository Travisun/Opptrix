import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { NETEASE_SETTINGS } from './settings.js'
import { cnEquityEtfIndex } from '../common/bindings.js'

export const NETEASE_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.STOCK_LIST,
  Capability.MARKET_BREADTH,
]

export const NETEASE_SPEC: ProviderManifestSpec = {
  id: 'netease',
  title: '网易财经',
  subtitle: '网易财经数据中心 · 接口已停服，默认关闭（可改由新浪财经替代）',
  marketGroup: 'CN',
  defaultPriority: 24,
  maxConcurrent: 3,
  capabilities: NETEASE_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
    [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_LIST,
      Capability.MARKET_BREADTH,
    ],
    [Capability.INDEX_REALTIME, Capability.INDEX_KLINE],
    p,
    undefined,
    maxConcurrent,
  ),
  settings: NETEASE_SETTINGS,
  supportsTest: true,
}

export const NETEASE_MANIFEST = providerManifestEntry(
  'netease',
  '网易财经',
  '网易财经数据中心 · 接口已停服，默认关闭（可改由新浪财经替代）',
  'CN',
  24,
  NETEASE_SETTINGS,
)
