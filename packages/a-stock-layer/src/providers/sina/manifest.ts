import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { SINA_SETTINGS } from './settings.js'
import { cnEquityEtfIndex } from '../common/bindings.js'

export const SINA_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.STOCK_LIST,
  Capability.MARKET_BREADTH,
  Capability.GLOBAL_INDEX,
]

export const SINA_SPEC: ProviderManifestSpec = {
  id: 'sina',
  title: '新浪财经',
  subtitle: '新浪财经数据中心 · 代用户浏览（实时/K线/列表 · 限速 2 秒/次）',
  marketGroup: 'CN',
  defaultPriority: 24,
  maxConcurrent: 3,
  capabilities: SINA_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
    [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_LIST,
      Capability.MARKET_BREADTH,
      Capability.GLOBAL_INDEX,
    ],
    [Capability.INDEX_REALTIME, Capability.INDEX_KLINE],
    p,
    undefined,
    maxConcurrent,
  ),
  settings: SINA_SETTINGS,
  supportsTest: true,
}

export const SINA_MANIFEST = providerManifestEntry(
  'sina',
  '新浪财经',
  '新浪财经数据中心 · 代用户浏览（实时/K线/列表 · 限速 2 秒/次，无并发）',
  'CN',
  24,
  SINA_SETTINGS,
)
