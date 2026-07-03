import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { BINANCE_SETTINGS } from './settings.js'
import {
  cryptoSpotBindings,
} from '../common/bindings.js'

export const BINANCE_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_LIST,
    ]

export const BINANCE_SPEC: ProviderManifestSpec = {
  id: 'binance',
  title: 'Binance',
  subtitle: 'Binance 官方公开行情 API',
  marketGroup: 'CRYPTO',
  defaultPriority: 100,
  capabilities: BINANCE_CAPS,
  bindingsFor: (p) => cryptoSpotBindings(BINANCE_CAPS, p),
  settings: BINANCE_SETTINGS,
}

export const BINANCE_MANIFEST = providerManifestEntry(
  'binance', 'Binance', 'Binance 官方公开行情 API', 'CRYPTO', 100, BINANCE_SETTINGS,
)
