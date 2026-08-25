import { Capability } from '../../core/capabilities.js'
import { CN_ETF_CAPABILITIES, cnFundBindings } from '../../core/bindings.js'
import { type ProviderManifestSpec } from '../common/types.js'
import { providerManifestEntry } from '../common/manifest.js'
import { TONGHUASHUN_SETTINGS } from './settings.js'
import { cnEquityEtfIndex } from '../common/bindings.js'
import { TONGHUASHUN_CN_FUND_CAPABILITIES } from './fund-capabilities.js'

export const TONGHUASHUN_CAPS = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_LIST,
  Capability.STOCK_PROFILE,
  Capability.FINANCIAL_SUMMARY,
  Capability.INCOME_STMT,
  Capability.BALANCE_SHEET,
  Capability.CASH_FLOW,
  Capability.DIVIDEND,
  Capability.TRADE_CALENDAR,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.INDEX_CONST,
  Capability.DRAGON_TIGER,
  Capability.LIMIT_UPDOWN,
  Capability.SENTIMENT,
]

const INDEX_CAPS = [
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.INDEX_CONST,
]

const EQUITY_CAPS = TONGHUASHUN_CAPS.filter(c => !INDEX_CAPS.includes(c))

export const TONGHUASHUN_SPEC: ProviderManifestSpec = {
  id: 'tonghuashun',
  title: '同花顺',
  subtitle: '同花顺行情与基本面数据',
  marketGroup: 'CN',
  defaultPriority: 120,
  maxConcurrent: 5,
  capabilities: [...new Set([
    ...TONGHUASHUN_CAPS,
    ...CN_ETF_CAPABILITIES,
    ...TONGHUASHUN_CN_FUND_CAPABILITIES,
  ])],
  bindingsFor: (p, maxConcurrent) => [
    ...cnEquityEtfIndex(
      EQUITY_CAPS,
      INDEX_CAPS,
      p,
      CN_ETF_CAPABILITIES,
      maxConcurrent,
    ),
    ...cnFundBindings(p, maxConcurrent),
  ],
  settings: TONGHUASHUN_SETTINGS,
  supportsTest: true,
}

export const TONGHUASHUN_MANIFEST = providerManifestEntry(
  'tonghuashun',
  '同花顺',
  '同花顺行情与基本面数据',
  'CN',
  120,
  TONGHUASHUN_SETTINGS,
)
