import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TONGHUASHUN_SETTINGS } from './settings.js'
import {
  cnEquityBindings, cnEtfBindings, cnIndexBindings, usEquityBindings, cryptoSpotBindings, cnEquityEtfIndex, cnFullSplit,
} from '../common/bindings.js'

export const TONGHUASHUN_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.INDEX_REALTIME,
    ]

export const TONGHUASHUN_SPEC: ProviderManifestSpec = {
  id: 'tonghuashun',
  title: '同花顺',
  subtitle: '实时行情回退',
  marketGroup: 'CN',
  defaultPriority: 35,
  capabilities: TONGHUASHUN_CAPS,
  bindingsFor: (p) => cnEquityEtfIndex(
      TONGHUASHUN_CAPS.filter(c => ![
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
        Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE, Capability.MACRO_INDICATOR,
      ].includes(c)),
      TONGHUASHUN_CAPS.filter(c => [
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
      ].includes(c)),
      p,
    ),
  settings: TONGHUASHUN_SETTINGS,
}

export const TONGHUASHUN_MANIFEST = providerManifestEntry(
  'tonghuashun', '同花顺', '实时行情回退', 'CN', 35, TONGHUASHUN_SETTINGS,
)
