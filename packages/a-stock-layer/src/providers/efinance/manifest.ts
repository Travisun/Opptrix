import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { EFINANCE_SETTINGS } from './settings.js'
import {
  cnEquityBindings, cnEtfBindings, cnIndexBindings, usEquityBindings, cryptoSpotBindings, cnEquityEtfIndex, cnFullSplit,
} from '../common/bindings.js'

export const EFINANCE_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.INDEX_REALTIME,
      Capability.INDEX_KLINE,
      Capability.STOCK_MONEY_FLOW,
      Capability.STOCK_PROFILE,
      Capability.STOCK_LIST,
    ]

export const EFINANCE_SPEC: ProviderManifestSpec = {
  id: 'efinance',
  title: 'efinance',
  subtitle: '东财 HTTP 封装',
  marketGroup: 'CN',
  defaultPriority: 80,
  capabilities: EFINANCE_CAPS,
  bindingsFor: (p) => cnEquityEtfIndex(
      EFINANCE_CAPS.filter(c => ![
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
        Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE, Capability.MACRO_INDICATOR,
      ].includes(c)),
      EFINANCE_CAPS.filter(c => [
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
      ].includes(c)),
      p,
    ),
  settings: EFINANCE_SETTINGS,
}

export const EFINANCE_MANIFEST = providerManifestEntry(
  'efinance', 'efinance', '东财 HTTP 封装', 'CN', 80, EFINANCE_SETTINGS,
)
