import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { SINA_SETTINGS } from './settings.js'
import {
  cnEquityBindings, cnEtfBindings, cnIndexBindings, usEquityBindings, cryptoSpotBindings, cnEquityEtfIndex, cnFullSplit,
} from '../common/bindings.js'

export const SINA_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.INDEX_REALTIME,
      Capability.GLOBAL_INDEX,
    ]

export const SINA_SPEC: ProviderManifestSpec = {
  id: 'sina',
  title: '新浪行情',
  subtitle: '实时行情回退',
  marketGroup: 'CN',
  defaultPriority: 40,
  capabilities: SINA_CAPS,
  bindingsFor: (p) => cnEquityEtfIndex(
      SINA_CAPS.filter(c => ![
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
        Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE, Capability.MACRO_INDICATOR,
      ].includes(c)),
      SINA_CAPS.filter(c => [
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
      ].includes(c)),
      p,
    ),
  settings: SINA_SETTINGS,
}

export const SINA_MANIFEST = providerManifestEntry(
  'sina', '新浪行情', '实时行情回退', 'CN', 40, SINA_SETTINGS,
)
