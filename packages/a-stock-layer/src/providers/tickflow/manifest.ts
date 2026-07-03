import { Capability } from '../../core/capabilities.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TICKFLOW_SETTINGS } from './settings.js'
import {
  usEquityBindings,
  cnEquityEtfIndex,
  regionalEquityBindings,
} from '../common/bindings.js'

const TICKFLOW_EQUITY_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_LIST,
  Capability.STOCK_PROFILE,
]

const TICKFLOW_CN_EXPERT_CAPS = [
  Capability.FINANCIAL_SUMMARY,
  Capability.BALANCE_SHEET,
  Capability.INCOME_STMT,
  Capability.CASH_FLOW,
]

const TICKFLOW_CN_INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]

/** A 股个股分时（TickFlow /v1/klines/intraday，仅当日） */
const TICKFLOW_CN_INTRADAY_CAPS = [Capability.INTRADAY_TICK]

export const TICKFLOW_CAPS = [
  ...TICKFLOW_EQUITY_CAPS,
  ...TICKFLOW_CN_EXPERT_CAPS,
  ...TICKFLOW_CN_INDEX_CAPS,
  ...TICKFLOW_CN_INTRADAY_CAPS,
]

export const TICKFLOW_SPEC: ProviderManifestSpec = {
  id: 'tickflow',
  title: 'TickFlow',
  subtitle: 'A股/港股/美股行情与 A 股分时，需 API Key',
  marketGroup: 'GLOBAL',
  defaultPriority: 85,
  capabilities: TICKFLOW_CAPS,
  bindingsFor: (p) => [
    ...usEquityBindings(TICKFLOW_EQUITY_CAPS, p),
    ...cnEquityEtfIndex(
      [...TICKFLOW_EQUITY_CAPS, ...TICKFLOW_CN_EXPERT_CAPS, ...TICKFLOW_CN_INTRADAY_CAPS],
      TICKFLOW_CN_INDEX_CAPS,
      p,
    ),
    ...regionalEquityBindings('HK', TICKFLOW_EQUITY_CAPS, p),
  ],
  settings: TICKFLOW_SETTINGS,
  supportsTest: true,
}

export const TICKFLOW_MANIFEST = providerManifestEntry(
  'tickflow',
  'TickFlow',
  'A股/港股/美股行情与 A 股分时，需 API Key',
  'GLOBAL',
  85,
  TICKFLOW_SETTINGS,
)
