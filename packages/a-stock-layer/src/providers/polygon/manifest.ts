import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { POLYGON_SETTINGS } from './settings.js'
import {
  usEquityBindings,
} from '../common/bindings.js'

export const POLYGON_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_PROFILE,
      Capability.STOCK_LIST,
      Capability.FINANCIAL_SUMMARY,
    ]

export const POLYGON_SPEC: ProviderManifestSpec = {
  id: 'polygon',
  title: 'Polygon.io',
  subtitle: '美股主数据源，需 API Key',
  marketGroup: 'US',
  defaultPriority: 100,
  capabilities: POLYGON_CAPS,
  bindingsFor: (p) => usEquityBindings(POLYGON_CAPS, p),
  settings: POLYGON_SETTINGS,
  supportsTest: true,
}

export const POLYGON_MANIFEST = providerManifestEntry(
  'polygon', 'Polygon.io', '美股主数据源，需 API Key', 'US', 100, POLYGON_SETTINGS,
)
