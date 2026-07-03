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
]

export const TDX_SPEC: ProviderManifestSpec = {
  id: 'tdx',
  title: '通达信 TCP',
  subtitle: '纯 Node 通达信协议行情（原 mootdx / pytdx 合一）',
  marketGroup: 'CN',
  defaultPriority: 90,
  capabilities: TDX_CAPS,
  bindingsFor: (p) => [
    ...cnEquityBindings([Capability.STOCK_REALTIME, Capability.STOCK_KLINE], p),
    ...cnEtfBindings(p).filter(b =>
      b.capability === Capability.STOCK_REALTIME || b.capability === Capability.STOCK_KLINE,
    ),
    ...cnIndexBindings([Capability.INDEX_REALTIME, Capability.INDEX_KLINE], p),
  ],
  settings: TDX_SETTINGS,
}

export const TDX_MANIFEST = providerManifestEntry(
  'tdx', '通达信 TCP', '纯 Node 通达信协议行情', 'CN', 90, TDX_SETTINGS,
)
