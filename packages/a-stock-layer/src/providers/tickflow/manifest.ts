import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TICKFLOW_SETTINGS } from './settings.js'
import {
  usEquityBindings,
  cnEquityEtfIndex,
  regionalEquityBindings,
} from '../common/bindings.js'
import { FREE_CN_ETF_CAPABILITIES } from '../common/etf-capabilities.js'

const TICKFLOW_EQUITY_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_LIST,
  Capability.STOCK_BASIC,
  Capability.STOCK_PROFILE,
]

const TICKFLOW_CN_EXPERT_CAPS = [
  Capability.FINANCIAL_SUMMARY,
  Capability.BALANCE_SHEET,
  Capability.INCOME_STMT,
  Capability.CASH_FLOW,
  Capability.SHAREHOLDER,
  Capability.GLOBAL_INDEX,
]

const TICKFLOW_CN_INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

/** A 股个股分时（TickFlow /v1/klines/intraday，仅当日） */
const TICKFLOW_CN_INTRADAY_CAPS = [Capability.INTRADAY_TICK]

const TICKFLOW_FREE_ETF_CAPS = [
  ...FREE_CN_ETF_CAPABILITIES,
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
]

export const TICKFLOW_CAPS = [
  ...TICKFLOW_EQUITY_CAPS,
  ...TICKFLOW_CN_EXPERT_CAPS,
  ...TICKFLOW_CN_INDEX_CAPS,
  ...TICKFLOW_CN_INTRADAY_CAPS,
  ...FREE_CN_ETF_CAPABILITIES,
]

export const TICKFLOW_SPEC: ProviderManifestSpec = {
  id: 'tickflow',
  title: 'TickFlow',
  subtitle: 'A股/港股/美股行情与 A 股分时，需 API Key（api.tickflow.org）',
  marketGroup: 'GLOBAL',
  defaultPriority: 80,
  maxConcurrent: 5,
  capabilities: TICKFLOW_CAPS,
  bindingsFor: (p, maxConcurrent) => [
    ...usEquityBindings(TICKFLOW_EQUITY_CAPS, p, maxConcurrent),
    ...cnEquityEtfIndex(
      [...TICKFLOW_EQUITY_CAPS, ...TICKFLOW_CN_EXPERT_CAPS, ...TICKFLOW_CN_INTRADAY_CAPS],
      TICKFLOW_CN_INDEX_CAPS,
      p,
      TICKFLOW_FREE_ETF_CAPS,
      maxConcurrent,
    ),
    ...regionalEquityBindings('HK', TICKFLOW_EQUITY_CAPS, p, maxConcurrent),
  ],
  settings: TICKFLOW_SETTINGS,
  supportsTest: true,
}

export const TICKFLOW_MANIFEST = providerManifestEntry(
  'tickflow',
  'TickFlow',
  'A股/港股/美股行情与 A 股分时，需 API Key（api.tickflow.org）',
  'GLOBAL',
  80,
  TICKFLOW_SETTINGS,
)
