import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { STATS_GOV_SETTINGS } from './settings.js'
import {
  cnEquityBindings,
} from '../common/bindings.js'

export const STATS_GOV_CAPS = [
      Capability.MACRO_INDICATOR,
    ]

export const STATS_GOV_SPEC: ProviderManifestSpec = {
  id: 'stats_gov',
  title: '国家统计局',
  subtitle: '宏观指标',
  marketGroup: 'GLOBAL',
  defaultPriority: 15,
  capabilities: STATS_GOV_CAPS,
  bindingsFor: (p) => cnEquityBindings(STATS_GOV_CAPS, p),
  settings: STATS_GOV_SETTINGS,
}

export const STATS_GOV_MANIFEST = providerManifestEntry(
  'stats_gov', '国家统计局', '宏观指标', 'GLOBAL', 15, STATS_GOV_SETTINGS,
)
