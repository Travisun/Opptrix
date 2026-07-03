import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { yahooRegionalSettings } from './settings.js'
import { regionalEquityBindings } from '../common/bindings.js'

export const YAHOO_REGIONAL_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_LIST,
]

export function yahooRegionalSpec(market: 'JP' | 'KR' | 'HK'): ProviderManifestSpec {
  const labels: Record<'JP' | 'KR' | 'HK', { title: string; subtitle: string }> = {
    JP: { title: 'Yahoo 财经 · 日股', subtitle: '日本股市行情（非官方接口）' },
    KR: { title: 'Yahoo 财经 · 韩股', subtitle: '韩国股市行情（非官方接口）' },
    HK: { title: 'Yahoo 财经 · 港股', subtitle: '香港股市行情（非官方接口）' },
  }
  const { title, subtitle } = labels[market]
  return {
    id: `yahoo_${market.toLowerCase()}`,
    title,
    subtitle,
    marketGroup: market,
    defaultPriority: 40,
    capabilities: YAHOO_REGIONAL_CAPS,
    bindingsFor: (p) => regionalEquityBindings(market, YAHOO_REGIONAL_CAPS, p),
    settings: yahooRegionalSettings(market),
  }
}

export const YAHOO_JP_MANIFEST = providerManifestEntry(
  'yahoo_jp', 'Yahoo 财经 · 日股', '日本股市行情（非官方接口）', 'JP', 40, yahooRegionalSettings('JP'),
)
export const YAHOO_KR_MANIFEST = providerManifestEntry(
  'yahoo_kr', 'Yahoo 财经 · 韩股', '韩国股市行情（非官方接口）', 'KR', 40, yahooRegionalSettings('KR'),
)
export const YAHOO_HK_MANIFEST = providerManifestEntry(
  'yahoo_hk', 'Yahoo 财经 · 港股', '香港股市行情（非官方接口）', 'HK', 40, yahooRegionalSettings('HK'),
)

export function yahooRegionalManifests() {
  return [YAHOO_JP_MANIFEST, YAHOO_KR_MANIFEST, YAHOO_HK_MANIFEST]
}
