import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { GUBA_SETTINGS } from './settings.js'
import {
  cnEquityBindings,
} from '../common/bindings.js'

export const GUBA_CAPS = [
      Capability.SENTIMENT,
      Capability.NEWS,
    ]

export const GUBA_SPEC: ProviderManifestSpec = {
  id: 'guba',
  title: '东方财富股吧',
  subtitle: '舆情与讨论',
  marketGroup: 'CN',
  defaultPriority: 15,
  capabilities: GUBA_CAPS,
  bindingsFor: (p) => cnEquityBindings(GUBA_CAPS, p),
  settings: GUBA_SETTINGS,
}

export const GUBA_MANIFEST = providerManifestEntry(
  'guba', '东方财富股吧', '舆情与讨论', 'CN', 15, GUBA_SETTINGS,
)
