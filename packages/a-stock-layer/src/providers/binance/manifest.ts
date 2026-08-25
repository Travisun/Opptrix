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
  subtitle: '加密货币公开行情，无需密钥',
  marketGroup: 'CRYPTO',
  defaultPriority: 100,
  maxConcurrent: 5,
  capabilities: BINANCE_CAPS,
  bindingsFor: (p, maxConcurrent) => cryptoSpotBindings(BINANCE_CAPS, p, maxConcurrent),
  settings: BINANCE_SETTINGS,
}

export const BINANCE_MANIFEST = providerManifestEntry(
  'binance', 'Binance', '加密货币公开行情，无需密钥', 'CRYPTO', 100, BINANCE_SETTINGS,
)
