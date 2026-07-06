import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { XUEQIU_SETTINGS } from './settings.js'
import {
  cnEquityBindings, cnEtfBindings, cnIndexBindings, usEquityBindings, cryptoSpotBindings, cnEquityEtfIndex, cnFullSplit,
} from '../common/bindings.js'

export const XUEQIU_CAPS = [
      Capability.STOCK_REALTIME,
      Capability.INDEX_REALTIME,
      Capability.STOCK_MONEY_FLOW,
    ]

export const XUEQIU_SPEC: ProviderManifestSpec = {
  id: 'xueqiu',
  title: '雪球',
  subtitle: '行情与资金流',
  marketGroup: 'CN',
  defaultPriority: 10,
  maxConcurrent: 1,
  capabilities: XUEQIU_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
      XUEQIU_CAPS.filter(c => ![
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
        Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE, Capability.MACRO_INDICATOR,
      ].includes(c)),
      XUEQIU_CAPS.filter(c => [
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
      ].includes(c)),
      p,
      undefined,
      maxConcurrent,
    ),
  settings: XUEQIU_SETTINGS,
}

export const XUEQIU_MANIFEST = providerManifestEntry(
  'xueqiu', '雪球', '行情与资金流', 'CN', 10, XUEQIU_SETTINGS,
)
