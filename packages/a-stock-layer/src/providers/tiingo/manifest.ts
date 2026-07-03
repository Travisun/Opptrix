import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TIINGO_SETTINGS } from './settings.js'
import {
  usEquityBindings,
} from '../common/bindings.js'

export const TIINGO_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_PROFILE,
      Capability.STOCK_LIST,
      Capability.FINANCIAL_SUMMARY,
    ]

export const TIINGO_SPEC: ProviderManifestSpec = {
  id: 'tiingo',
  title: 'Tiingo',
  subtitle: '美股第二数据源，需 API Token',
  marketGroup: 'US',
  defaultPriority: 55,
  capabilities: TIINGO_CAPS,
  bindingsFor: (p) => usEquityBindings(TIINGO_CAPS, p),
  settings: TIINGO_SETTINGS,
  supportsTest: true,
}

export const TIINGO_MANIFEST = providerManifestEntry(
  'tiingo', 'Tiingo', '美股第二数据源，需 API Token', 'US', 55, TIINGO_SETTINGS,
)
