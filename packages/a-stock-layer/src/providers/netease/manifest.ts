import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { NETEASE_SETTINGS } from './settings.js'
import {
  cnEquityBindings,
} from '../common/bindings.js'

export const NETEASE_CAPS = [
      Capability.STOCK_KLINE,
      Capability.INDEX_KLINE,
    ]

export const NETEASE_SPEC: ProviderManifestSpec = {
  id: 'netease',
  title: '网易财经',
  subtitle: '历史 K 线回退',
  marketGroup: 'CN',
  defaultPriority: 20,
  capabilities: NETEASE_CAPS,
  bindingsFor: (p) => cnEquityBindings(NETEASE_CAPS, p),
  settings: NETEASE_SETTINGS,
}

export const NETEASE_MANIFEST = providerManifestEntry(
  'netease', '网易财经', '历史 K 线回退', 'CN', 20, NETEASE_SETTINGS,
)
