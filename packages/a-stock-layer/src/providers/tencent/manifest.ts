import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TENCENT_SETTINGS } from './settings.js'
import {
  cnEquityBindings, cnEtfBindings, cnIndexBindings, usEquityBindings, cryptoSpotBindings, cnEquityEtfIndex, cnFullSplit,
} from '../common/bindings.js'

export const TENCENT_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.INDEX_KLINE,
      Capability.INDEX_REALTIME,
      Capability.GLOBAL_INDEX,
      Capability.EXCHANGE_RATE,
    ]

export const TENCENT_SPEC: ProviderManifestSpec = {
  id: 'tencent',
  title: '腾讯行情',
  subtitle: '实时 / K 线回退',
  marketGroup: 'CN',
  defaultPriority: 50,
  capabilities: TENCENT_CAPS,
  bindingsFor: (p) => cnEquityEtfIndex(
      TENCENT_CAPS.filter(c => ![
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
        Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE, Capability.MACRO_INDICATOR,
      ].includes(c)),
      TENCENT_CAPS.filter(c => [
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
      ].includes(c)),
      p,
    ),
  settings: TENCENT_SETTINGS,
}

export const TENCENT_MANIFEST = providerManifestEntry(
  'tencent', '腾讯行情', '实时 / K 线回退', 'CN', 50, TENCENT_SETTINGS,
)
