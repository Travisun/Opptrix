import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TUSHARE_SETTINGS } from './settings.js'
import {
  cnEquityBindings, cnEtfBindings, cnIndexBindings, usEquityBindings, cryptoSpotBindings, cnEquityEtfIndex, cnFullSplit,
} from '../common/bindings.js'

export const TUSHARE_CAPS = [
      Capability.STOCK_LIST,
      Capability.STOCK_REALTIME,
      Capability.STOCK_KLINE,
      Capability.INDEX_REALTIME,
      Capability.INDEX_KLINE,
      Capability.STOCK_PROFILE,
      Capability.FINANCIAL_SUMMARY,
      Capability.DIVIDEND,
      Capability.SHAREHOLDER,
      Capability.PERF_FORECAST,
      Capability.INST_HOLDING,
      Capability.INSIDER_TRADE,
      Capability.BUYBACK,
      Capability.MAIN_BUSINESS,
      Capability.TRADE_CALENDAR,
    ]

export const TUSHARE_SPEC: ProviderManifestSpec = {
  id: 'tushare',
  title: 'Tushare Pro',
  subtitle: '批量行情与基本面，需 Token',
  marketGroup: 'CN',
  defaultPriority: 90,
  capabilities: TUSHARE_CAPS,
  bindingsFor: (p) => cnEquityEtfIndex(
      TUSHARE_CAPS.filter(c => ![
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
        Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE, Capability.MACRO_INDICATOR,
      ].includes(c)),
      TUSHARE_CAPS.filter(c => [
        Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
      ].includes(c)),
      p,
    ),
  settings: TUSHARE_SETTINGS,
  supportsTest: true,
}

export const TUSHARE_MANIFEST = providerManifestEntry(
  'tushare', 'Tushare Pro', '批量行情与基本面，需 Token', 'CN', 90, TUSHARE_SETTINGS,
)
