import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { CNINFO_SETTINGS } from './settings.js'
import {
  cnEquityBindings,
} from '../common/bindings.js'

export const CNINFO_CAPS = [
      Capability.NEWS,
    ]

export const CNINFO_SPEC: ProviderManifestSpec = {
  id: 'cninfo',
  title: '巨潮资讯',
  subtitle: '公告新闻',
  marketGroup: 'CN',
  defaultPriority: 25,
  capabilities: CNINFO_CAPS,
  bindingsFor: (p) => cnEquityBindings(CNINFO_CAPS, p),
  settings: CNINFO_SETTINGS,
}

export const CNINFO_MANIFEST = providerManifestEntry(
  'cninfo', '巨潮资讯', '公告新闻', 'CN', 25, CNINFO_SETTINGS,
)
