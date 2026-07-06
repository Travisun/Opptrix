import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import {
  cnEquityBindings,
  regionalEquityBindings,
  usEquityBindings,
} from '../common/bindings.js'
import { YFINANCE_SETTINGS } from './settings.js'

const US_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_PROFILE,
  Capability.STOCK_LIST,
  Capability.FINANCIAL_SUMMARY,
]

const REGIONAL_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_LIST,
]

export const YFINANCE_CAPS = [
  ...US_CAPS,
  ...REGIONAL_CAPS,
  Capability.GLOBAL_INDEX,
]

export const YFINANCE_SPEC: ProviderManifestSpec = {
  id: 'yfinance',
  title: 'Yahoo 财经',
  subtitle: 'Yahoo Finance · 代用户浏览（美/港/日/韩行情 · 限速 2 秒/次）',
  marketGroup: 'GLOBAL',
  defaultPriority: 46,
  maxConcurrent: 1,
  capabilities: YFINANCE_CAPS,
  bindingsFor: (p, maxConcurrent) => [
    ...usEquityBindings(US_CAPS, p, maxConcurrent),
    ...regionalEquityBindings('HK', REGIONAL_CAPS, p, maxConcurrent),
    ...regionalEquityBindings('JP', REGIONAL_CAPS, p, maxConcurrent),
    ...regionalEquityBindings('KR', REGIONAL_CAPS, p, maxConcurrent),
    ...cnEquityBindings([Capability.GLOBAL_INDEX], p, maxConcurrent),
  ],
  settings: YFINANCE_SETTINGS,
  supportsTest: true,
}

export const YFINANCE_MANIFEST = providerManifestEntry(
  'yfinance',
  'Yahoo 财经',
  'Yahoo Finance · 代用户浏览（美/港/日/韩行情 · 限速 2 秒/次，无并发）',
  'GLOBAL',
  46,
  YFINANCE_SETTINGS,
)
