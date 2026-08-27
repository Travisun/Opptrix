import type { ProviderBinding } from '@opptrix/shared'
import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { YFINANCE_SETTINGS } from './settings.js'
import { YFINANCE_HANDLER_CAPS } from './handler.js'

const INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

function globalIndexBindings(priority: number, maxConcurrent?: number): ProviderBinding[] {
  return [{
    market: 'CN',
    assetClass: 'EQUITY',
    capability: Capability.GLOBAL_INDEX,
    defaultPriority: priority,
    ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
  }]
}

function crossMarketIndexBindings(
  markets: Array<'US' | 'HK' | 'JP'>,
  capabilities: Capability[],
  priority: number,
  maxConcurrent?: number,
): ProviderBinding[] {
  const rows: ProviderBinding[] = []
  for (const market of markets) {
    for (const capability of capabilities) {
      rows.push({
        market,
        assetClass: 'INDEX',
        capability,
        defaultPriority: priority,
        ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
      })
    }
  }
  return rows
}

export const YFINANCE_CAPS = YFINANCE_HANDLER_CAPS

export const YFINANCE_SPEC: ProviderManifestSpec = {
  id: 'yfinance',
  title: 'Yahoo Finance',
  subtitle: '全球指数实时与历史走势，无需密钥',
  marketGroup: 'GLOBAL',
  defaultPriority: 118,
  maxConcurrent: 4,
  capabilities: YFINANCE_CAPS,
  bindingsFor: (p, maxConcurrent) => [
    ...globalIndexBindings(p, maxConcurrent),
    ...crossMarketIndexBindings(['US', 'HK', 'JP'], INDEX_CAPS, p, maxConcurrent),
  ],
  settings: YFINANCE_SETTINGS,
}

export const YFINANCE_MANIFEST = providerManifestEntry(
  'yfinance',
  'Yahoo Finance',
  '全球指数实时与历史走势，无需密钥',
  'GLOBAL',
  118,
  YFINANCE_SETTINGS,
)
