import { Capability } from '../../core/capabilities.js'
import type { ProviderBinding } from '@opptrix/shared'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { STOCKINDEX_SETTINGS } from './settings.js'
import { STOCKINDEX_HANDLER_CAPS } from './handler.js'

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
      Capability.SECTOR_LIST,
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
  return rows
}

export const STOCKINDEX_CAPS = STOCKINDEX_HANDLER_CAPS

export const STOCKINDEX_SPEC: ProviderManifestSpec = {
  id: 'stockindex',
  title: 'StockIndex',
  subtitle: '跨市场标的索引（搜索 / 板块 / 申万行业 / ETF·LOF 名录）',
  marketGroup: 'GLOBAL',
  defaultPriority: 92,
  maxConcurrent: 4,
  capabilities: STOCKINDEX_CAPS,
  bindingsFor: (p, maxConcurrent) => crossMarketBindings(p, maxConcurrent),
  settings: STOCKINDEX_SETTINGS,
}

export const STOCKINDEX_MANIFEST = providerManifestEntry(
  'stockindex',
  'StockIndex',
  '跨市场标的索引服务（CN/HK/US 搜索、板块与行业成分）',
  'GLOBAL',
  92,
  STOCKINDEX_SETTINGS,
)
