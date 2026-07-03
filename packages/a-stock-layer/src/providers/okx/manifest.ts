import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { OKX_SETTINGS } from './settings.js'
import {
  cryptoSpotBindings,
} from '../common/bindings.js'

export const OKX_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_LIST,
    ]

export const OKX_SPEC: ProviderManifestSpec = {
  id: 'okx',
  title: 'OKX',
  subtitle: 'Crypto SPOT 回退',
  marketGroup: 'CRYPTO',
  defaultPriority: 90,
  capabilities: OKX_CAPS,
  bindingsFor: (p) => cryptoSpotBindings(OKX_CAPS, p),
  settings: OKX_SETTINGS,
}

export const OKX_MANIFEST = providerManifestEntry(
  'okx', 'OKX', 'Crypto SPOT 回退', 'CRYPTO', 90, OKX_SETTINGS,
)
