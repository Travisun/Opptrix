import { Capability } from '../../core/capabilities.js'
import type { ProviderBinding } from '@opptrix/shared'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { STOCKINDEX_SETTINGS } from './settings.js'
import { STOCKINDEX_HANDLER_CAPS } from './handler.js'

/** OpptrixQuant 仅登记标的搜索 — 不提供行情/净值/档案等数据能力 */
function searchOnlyBindings(
  priority: number,
  maxConcurrent?: number,
): ProviderBinding[] {
  const markets = ['CN', 'US', 'HK'] as const
  const rows: ProviderBinding[] = []
  for (const market of markets) {
    rows.push({
      market,
      assetClass: 'EQUITY',
      capability: Capability.INSTRUMENT_SEARCH,
      defaultPriority: priority,
      ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
    })
  }
  return rows
}

export const STOCKINDEX_CAPS = STOCKINDEX_HANDLER_CAPS

export const STOCKINDEX_SPEC: ProviderManifestSpec = {
  id: 'stockindex',
  title: 'Opptrix量化',
  subtitle: 'Opptrix量化社区提供的标的检索接口',
  marketGroup: 'GLOBAL',
  defaultPriority: 115,
  maxConcurrent: 4,
  capabilities: STOCKINDEX_CAPS,
  bindingsFor: (p, maxConcurrent) => searchOnlyBindings(p, maxConcurrent),
  settings: STOCKINDEX_SETTINGS,
}

export const STOCKINDEX_MANIFEST = providerManifestEntry(
  'stockindex',
  'Opptrix量化',
  'Opptrix量化社区提供的标的检索接口',
  'GLOBAL',
  115,
  STOCKINDEX_SETTINGS,
)
