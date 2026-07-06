import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { BAOSTOCK_SETTINGS } from './settings.js'
import { cnEquityEtfIndex } from '../common/bindings.js'

export const BAOSTOCK_CAPS = [
  Capability.STOCK_KLINE,
  Capability.STOCK_BASIC,
  Capability.STOCK_LIST,
  Capability.STOCK_PROFILE,
  Capability.INDEX_KLINE,
  Capability.INDEX_REALTIME,
  Capability.STOCK_REALTIME,
  Capability.TRADE_CALENDAR,
  Capability.DIVIDEND,
  Capability.FINANCIAL_SUMMARY,
  Capability.INCOME_STMT,
  Capability.BALANCE_SHEET,
  Capability.CASH_FLOW,
  Capability.INDEX_CONST,
  Capability.INTRADAY_TICK,
  Capability.MACRO_INDICATOR,
  Capability.PERF_FORECAST,
]

export const BAOSTOCK_SPEC: ProviderManifestSpec = {
  id: 'baostock',
  title: '证券宝 BaoStock',
  subtitle: '免费开源 A 股历史数据，无需注册',
  marketGroup: 'CN',
  defaultPriority: 105,
  maxConcurrent: 1,
  capabilities: BAOSTOCK_CAPS,
  bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(
    BAOSTOCK_CAPS.filter(c => ![
      Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
    ].includes(c)),
    BAOSTOCK_CAPS.filter(c => [
      Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.INDEX_CONST,
    ].includes(c)),
    p,
    undefined,
    maxConcurrent,
  ),
  settings: BAOSTOCK_SETTINGS,
  supportsTest: true,
}

export const BAOSTOCK_MANIFEST = providerManifestEntry(
  'baostock',
  '证券宝 BaoStock',
  '免费开源 A 股历史数据，无需注册',
  'CN',
  105,
  BAOSTOCK_SETTINGS,
)
