import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { YAHOO_US_SETTINGS } from './settings.js'
import {
  usEquityBindings,
} from '../common/bindings.js'

export const YAHOO_US_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.STOCK_PROFILE,
      Capability.STOCK_LIST,
      Capability.FINANCIAL_SUMMARY,
    ]

export const YAHOO_US_SPEC: ProviderManifestSpec = {
  id: 'yahoo_us',
  title: 'Yahoo 财经 · 美股',
  subtitle: '美股行情回退（非官方接口）',
  marketGroup: 'US',
  defaultPriority: 45,
  capabilities: YAHOO_US_CAPS,
  bindingsFor: (p) => usEquityBindings(YAHOO_US_CAPS, p),
  settings: YAHOO_US_SETTINGS,
}

export const YAHOO_US_MANIFEST = providerManifestEntry(
  'yahoo_us', 'Yahoo 财经 · 美股', '美股行情回退（非官方接口）', 'US', 45, YAHOO_US_SETTINGS,
)
