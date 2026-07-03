import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { FMP_SETTINGS } from './settings.js'
import {
  usEquityBindings,
} from '../common/bindings.js'

export const FMP_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_PROFILE,
      Capability.STOCK_LIST,
      Capability.FINANCIAL_SUMMARY,
    ]

export const FMP_SPEC: ProviderManifestSpec = {
  id: 'fmp',
  title: 'Financial Modeling Prep',
  subtitle: '美股第三数据源，需 API Key',
  marketGroup: 'US',
  defaultPriority: 50,
  capabilities: FMP_CAPS,
  bindingsFor: (p) => usEquityBindings(FMP_CAPS, p),
  settings: FMP_SETTINGS,
  supportsTest: true,
}

export const FMP_MANIFEST = providerManifestEntry(
  'fmp', 'Financial Modeling Prep', '美股第三数据源，需 API Key', 'US', 50, FMP_SETTINGS,
)
