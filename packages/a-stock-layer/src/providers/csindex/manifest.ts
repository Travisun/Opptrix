import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { CSINDEX_SETTINGS } from './settings.js'
import {
  cnIndexBindings,
} from '../common/bindings.js'

export const CSINDEX_CAPS = [
      Capability.INDEX_CONST,
    ]

export const CSINDEX_SPEC: ProviderManifestSpec = {
  id: 'csindex',
  title: '中证指数',
  subtitle: '指数成分股',
  marketGroup: 'CN',
  defaultPriority: 30,
  maxConcurrent: 1,
  capabilities: CSINDEX_CAPS,
  bindingsFor: (p, maxConcurrent) => cnIndexBindings(CSINDEX_CAPS, p, maxConcurrent),
  settings: CSINDEX_SETTINGS,
}

export const CSINDEX_MANIFEST = providerManifestEntry(
  'csindex', '中证指数', '指数成分股', 'CN', 30, CSINDEX_SETTINGS,
)
