import { Capability } from '../../core/capabilities.js'
import type { ProviderBinding } from '@opptrix/shared'
import { cnFundBindings } from '../../core/bindings.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { STOCKINDEX_SETTINGS } from './settings.js'
import { STOCKINDEX_HANDLER_CAPS } from './handler.js'

/** stockindex 已实现的基金能力（filter 掉 cnFundBindings 中的 FUND_LIST / FUND_HOLDINGS） */
const STOCKINDEX_FUND_CAPS: string[] = [
  Capability.FUND_PROFILE,
  Capability.FUND_NAV,
  Capability.FUND_QUOTE,
]

function crossMarketBindings(
  priority: number,
  maxConcurrent?: number,
): ProviderBinding[] {
  const markets = ['CN', 'US', 'HK'] as const
  const rows: ProviderBinding[] = []
  for (const market of markets) {
    for (const capability of [
      Capability.STOCK_LIST,
      Capability.INSTRUMENT_SEARCH,
    ]) {
      rows.push({
        market,
        assetClass: 'EQUITY',
        capability,
        defaultPriority: priority,
        ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
      })
    }
  }
  rows.push({
    market: 'CN',
    assetClass: 'ETF',
    capability: Capability.ETF_LIST,
    defaultPriority: priority,
    ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
  })
  rows.push(
    ...cnFundBindings(priority, maxConcurrent).filter(b =>
      STOCKINDEX_FUND_CAPS.includes(b.capability),
    ),
  )
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
  bindingsFor: (p, maxConcurrent) => crossMarketBindings(p, maxConcurrent),
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
