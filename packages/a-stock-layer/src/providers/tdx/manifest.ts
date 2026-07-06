import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TDX_SETTINGS } from './settings.js'
import {
  cnEquityBindings, cnEtfBindings, cnIndexBindings,
} from '../common/bindings.js'

export const TDX_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.INTRADAY_TICK,
]

export const TDX_SPEC: ProviderManifestSpec = {
  id: 'tdx',
  title: '通达信 TCP',
  subtitle: '代用户连接通达信行情服务器 · 限速 2 秒/次',
  marketGroup: 'CN',
  defaultPriority: 90,
  maxConcurrent: 1,
  capabilities: TDX_CAPS,
  bindingsFor: (p, maxConcurrent) => [
    ...cnEquityBindings(
      [Capability.STOCK_REALTIME, Capability.STOCK_KLINE, Capability.INTRADAY_TICK],
      p,
      maxConcurrent,
    ),
    ...cnEtfBindings(p, maxConcurrent).filter(b =>
      b.capability === Capability.STOCK_REALTIME
      || b.capability === Capability.STOCK_KLINE
      || b.capability === Capability.INTRADAY_TICK,
    ),
    ...cnIndexBindings([Capability.INDEX_REALTIME, Capability.INDEX_KLINE], p, maxConcurrent),
  ],
  settings: TDX_SETTINGS,
  supportsTest: true,
}

export const TDX_MANIFEST = providerManifestEntry(
  'tdx', '通达信 TCP', '代用户连接通达信行情服务器 · 限速 2 秒/次，无并发', 'CN', 90, TDX_SETTINGS,
)
