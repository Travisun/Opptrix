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
  subtitle: 'OKX 官方公开行情 API',
  marketGroup: 'CRYPTO',
  defaultPriority: 90,
  maxConcurrent: 5,
  capabilities: OKX_CAPS,
  bindingsFor: (p, maxConcurrent) => cryptoSpotBindings(OKX_CAPS, p, maxConcurrent),
  settings: OKX_SETTINGS,
}

export const OKX_MANIFEST = providerManifestEntry(
  'okx', 'OKX', 'OKX 官方公开行情 API', 'CRYPTO', 90, OKX_SETTINGS,
)
